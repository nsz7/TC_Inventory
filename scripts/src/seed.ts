import "./env";
import bcrypt from "bcryptjs";
import {
  db,
  pool,
  usersTable,
  varietiesTable,
  strainsTable,
  samplesTable,
  batchesTable,
  containerEventsTable,
  batchLineageTable,
  lookupOptionsTable,
  appSettingsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

// --- Local copies of the same assignment rules the API routes use --------
// (Kept self-contained rather than importing from the api-server package,
// which isn't set up to be depended on by other workspace packages.)

async function nextSerial(categoryCode: string, year: string): Promise<number> {
  const existing = await db
    .select({ serial: samplesTable.serial })
    .from(samplesTable)
    .where(and(eq(samplesTable.categoryCode, categoryCode), eq(samplesTable.year, year)));
  return existing.reduce((max, row) => Math.max(max, row.serial), 0) + 1;
}

async function nextSubcode(sampleId: number): Promise<string> {
  const existing = await db
    .select({ subcode: batchesTable.subcode })
    .from(batchesTable)
    .where(eq(batchesTable.sampleId, sampleId));
  const maxUsed = existing.reduce((max, row) => Math.max(max, parseInt(row.subcode, 10)), 0);
  return String(maxUsed + 1).padStart(2, "0");
}

function computeInherited(
  parent: { contaminationAlert: boolean; cleanTransferCount: number },
  appearedCleanAtTransfer: boolean,
) {
  if (!parent.contaminationAlert) return { contaminationAlert: false, cleanTransferCount: 0 };
  if (!appearedCleanAtTransfer) return { contaminationAlert: true, cleanTransferCount: 0 };
  const newCount = parent.cleanTransferCount + 1;
  if (newCount >= 2) return { contaminationAlert: false, cleanTransferCount: 0 };
  return { contaminationAlert: true, cleanTransferCount: newCount };
}

async function createSample(categoryCode: string, varietyId: number, strainId: number | null, createdBy: number) {
  const year = "26";
  const serial = await nextSerial(categoryCode, year);
  const sampleCode = `${categoryCode}${year}_${String(serial).padStart(3, "0")}`;
  const [sample] = await db
    .insert(samplesTable)
    .values({ sampleCode, categoryCode, year, serial, varietyId, strainId, createdBy, updatedBy: createdBy })
    .returning();
  return sample;
}

async function createInitiationBatch(
  sampleId: number,
  fields: {
    stage: string;
    transferDate: string;
    medium?: string;
    containerType?: string;
    location: string;
    initialQuantity: number;
  },
  createdBy: number,
) {
  const subcode = await nextSubcode(sampleId);
  const [batch] = await db
    .insert(batchesTable)
    .values({
      sampleId,
      subcode,
      stage: fields.stage,
      transferDate: fields.transferDate,
      medium: fields.medium ?? null,
      containerType: fields.containerType ?? null,
      location: fields.location,
      initialQuantity: fields.initialQuantity,
      createdBy,
      updatedBy: createdBy,
    })
    .returning();
  return batch;
}

async function subculture(
  source: typeof batchesTable.$inferSelect,
  output: {
    consumedQuantity: number;
    producedQuantity: number;
    stage: string;
    transferDate: string;
    medium?: string;
    containerType?: string;
    location: string;
    appearedCleanAtTransfer?: boolean;
  },
  createdBy: number,
) {
  const contamination = computeInherited(source, output.appearedCleanAtTransfer ?? true);
  const subcode = await nextSubcode(source.sampleId);
  const [child] = await db
    .insert(batchesTable)
    .values({
      sampleId: source.sampleId,
      subcode,
      stage: output.stage,
      transferDate: output.transferDate,
      medium: output.medium ?? source.medium,
      containerType: output.containerType ?? source.containerType,
      location: output.location,
      initialQuantity: output.producedQuantity,
      contaminationAlert: contamination.contaminationAlert,
      cleanTransferCount: contamination.cleanTransferCount,
      createdBy,
      updatedBy: createdBy,
    })
    .returning();

  // Mirrors the app's subculture route: a "subculture" record (quantity 0)
  // anchors the source-side timeline unconditionally, and consumption — if
  // any — is a separate, targetless transfer_out event.
  await db.insert(containerEventsTable).values({
    batchId: source.id,
    eventType: "subculture",
    quantity: 0,
    targetBatchId: child.id,
    eventDate: output.transferDate,
    createdBy,
  });
  if (output.consumedQuantity > 0) {
    await db.insert(containerEventsTable).values({
      batchId: source.id,
      eventType: "transfer_out",
      quantity: output.consumedQuantity,
      eventDate: output.transferDate,
      createdBy,
    });
  }
  await db.insert(batchLineageTable).values({ childBatchId: child.id, parentBatchId: source.id });
  return child;
}

// Mirrors artifacts/api-server/src/lib/contamination.ts's markHadContamination:
// only writes if not already true, so a batch that's discarded-from and later
// rescued-from doesn't get a redundant second write.
async function markHadContamination(batchId: number, updatedBy: number) {
  const [batch] = await db.select({ hadContamination: batchesTable.hadContamination }).from(batchesTable).where(eq(batchesTable.id, batchId));
  if (batch?.hadContamination) return;
  await db.update(batchesTable).set({ hadContamination: true, updatedBy }).where(eq(batchesTable.id, batchId));
}

async function discard(
  batch: typeof batchesTable.$inferSelect,
  quantity: number,
  reason: string,
  eventDate: string,
  createdBy: number,
) {
  await db.insert(containerEventsTable).values({
    batchId: batch.id,
    eventType: "discard",
    quantity,
    reason,
    eventDate,
    createdBy,
  });
  if (reason.toLowerCase() === "contaminated") {
    await markHadContamination(batch.id, createdBy);
  }
}

async function rescue(
  source: typeof batchesTable.$inferSelect,
  fields: {
    consumedQuantity: number;
    producedQuantity: number;
    stage: string;
    transferDate: string;
    medium?: string;
    containerType?: string;
    location: string;
  },
  createdBy: number,
) {
  const subcode = await nextSubcode(source.sampleId);
  const [child] = await db
    .insert(batchesTable)
    .values({
      sampleId: source.sampleId,
      subcode,
      stage: fields.stage,
      transferDate: fields.transferDate,
      medium: fields.medium ?? source.medium,
      containerType: fields.containerType ?? source.containerType,
      location: fields.location,
      initialQuantity: fields.producedQuantity,
      contaminationAlert: true,
      cleanTransferCount: 0,
      createdBy,
      updatedBy: createdBy,
    })
    .returning();

  await db.insert(containerEventsTable).values({
    batchId: source.id,
    eventType: "subculture",
    quantity: 0,
    targetBatchId: child.id,
    eventDate: fields.transferDate,
    createdBy,
  });
  if (fields.consumedQuantity > 0) {
    await db.insert(containerEventsTable).values({
      batchId: source.id,
      eventType: "transfer_out",
      quantity: fields.consumedQuantity,
      eventDate: fields.transferDate,
      createdBy,
    });
  }
  await db.insert(batchLineageTable).values({ childBatchId: child.id, parentBatchId: source.id });
  await markHadContamination(source.id, createdBy);
  return child;
}

async function poolBatches(
  parents: { batch: typeof batchesTable.$inferSelect; consumedQuantity: number }[],
  fields: {
    stage: string;
    transferDate: string;
    medium?: string;
    containerType?: string;
    location: string;
    producedQuantity: number;
  },
  createdBy: number,
) {
  const anyParentAlerted = parents.some((p) => p.batch.contaminationAlert);
  const subcode = await nextSubcode(parents[0].batch.sampleId);
  const [child] = await db
    .insert(batchesTable)
    .values({
      sampleId: parents[0].batch.sampleId,
      subcode,
      stage: fields.stage,
      transferDate: fields.transferDate,
      medium: fields.medium ?? parents[0].batch.medium,
      containerType: fields.containerType ?? parents[0].batch.containerType,
      location: fields.location,
      initialQuantity: fields.producedQuantity,
      contaminationAlert: anyParentAlerted,
      cleanTransferCount: 0,
      createdBy,
      updatedBy: createdBy,
    })
    .returning();

  // Pooling is a subculture too — tissue was taken from each parent to make
  // this one child — so it gets the same "subculture" record every other
  // transfer does. Unlike the one-source-many-children split, a pooled
  // batch's consumption event can still name its target unambiguously
  // (there's exactly one child), so it keeps target_batch_id rather than
  // going through the targetless operation-level event.
  for (const p of parents) {
    await db.insert(containerEventsTable).values({
      batchId: p.batch.id,
      eventType: "subculture",
      quantity: 0,
      targetBatchId: child.id,
      eventDate: fields.transferDate,
      createdBy,
    });
    if (p.consumedQuantity > 0) {
      await db.insert(containerEventsTable).values({
        batchId: p.batch.id,
        eventType: "transfer_out",
        quantity: p.consumedQuantity,
        targetBatchId: child.id,
        eventDate: fields.transferDate,
        createdBy,
      });
    }
  }
  await db.insert(batchLineageTable).values(parents.map((p) => ({ childBatchId: child.id, parentBatchId: p.batch.id })));
  return child;
}

// --- Lookup list defaults (mirrors artifacts/api-server/src/routes/options.ts) ---

const DEFAULT_OPTIONS: Record<string, string[]> = {
  stage: ["initiation", "multiplication", "rooting", "acclimatization", "revitalization", "long-term storage"],
  container: ["culture tube", "magenta box", "petri dish", "jar", "flask", "cryovial", "other"],
  media: ["MS", "MS + 0.1mg/L BAP", "MS + 1mg/L BAP", "WPM", "B5", "1/2 MS", "MS + glycerol"],
  location: ["Shelf A-1", "Shelf A-2", "Shelf B-1", "Shelf C-1", "Shelf C-2", "Freezer F-1"],
  category_code: ["FA", "BC", "CV"],
  discard_reason: ["contaminated", "poor growth", "used in experiment", "fully transferred — source retired", "other"],
  correction_reason: ["miscount", "previously unrecorded", "other"],
  archive_reason: ["line lost", "project ended", "transferred out", "other"],
};

async function seedOptions() {
  for (const [category, defaults] of Object.entries(DEFAULT_OPTIONS)) {
    const existing = await db.select().from(lookupOptionsTable).where(eq(lookupOptionsTable.category, category));
    if (existing.length === 0) {
      await db.insert(lookupOptionsTable).values(defaults.map((label, i) => ({ category, label, sortOrder: i })));
    }
  }
}

const SEEDED_VARIETIES = ["Desiree", "Cavendish", "Russet Burbank"];
const SEEDED_SAMPLE_CODES = ["FA26_001", "FA26_002", "FA26_003", "FA26_004"];

/**
 * Checks presence of the actual rows this script creates, not just a proxy
 * like "does the admin user exist" — a DB that's been truncated but kept
 * its admin row (or vice versa) must not be reported as fully seeded.
 */
async function checkSeedState() {
  const [existingAdmin] = await db.select().from(usersTable).where(eq(usersTable.username, "admin"));
  const [existingTech] = await db.select().from(usersTable).where(eq(usersTable.username, "tech1"));
  const varieties = await db
    .select({ label: varietiesTable.label })
    .from(varietiesTable)
    .where(inArray(varietiesTable.label, SEEDED_VARIETIES));
  const samples = await db
    .select({ sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .where(inArray(samplesTable.sampleCode, SEEDED_SAMPLE_CODES));

  const checks = [
    { label: "users (admin, tech1)", present: Boolean(existingAdmin) && Boolean(existingTech) },
    { label: `varieties (${SEEDED_VARIETIES.join(", ")})`, present: varieties.length === SEEDED_VARIETIES.length },
    { label: `samples (${SEEDED_SAMPLE_CODES.join(", ")})`, present: samples.length === SEEDED_SAMPLE_CODES.length },
  ];

  return {
    checks,
    allPresent: checks.every((c) => c.present),
    nonePresent: checks.every((c) => !c.present),
  };
}

async function main() {
  const { checks, allPresent, nonePresent } = await checkSeedState();

  if (allPresent) {
    console.log("Seed data already present — skipping:");
    for (const c of checks) console.log(`  - ${c.label}: found`);
    return;
  }

  if (!nonePresent) {
    console.log("Database is in a PARTIALLY seeded state — refusing to seed on top of it:");
    for (const c of checks) console.log(`  - ${c.label}: ${c.present ? "found" : "MISSING"}`);
    console.log("Truncate the seed-relevant tables (or drop/recreate the database) and rerun from a clean slate.");
    await pool.end();
    process.exit(1);
  }

  await seedOptions();
  await db.insert(appSettingsTable).values({ id: 1, defaultMinStorageStock: 5, defaultStorageRenewalIntervalMonths: 6 });

  const DEFAULT_PASSWORD = "changeme123";
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const [admin] = await db
    .insert(usersTable)
    .values({ username: "admin", passwordHash, displayName: "Admin", role: "admin" })
    .returning();
  const [tech] = await db
    .insert(usersTable)
    .values({ username: "tech1", passwordHash, displayName: "Lab Tech", role: "user", createdBy: admin.id })
    .returning();
  console.log(`Created users: admin/${DEFAULT_PASSWORD} (admin), tech1/${DEFAULT_PASSWORD} (user).`);
  const by = admin.id;

  const [desiree] = await db.insert(varietiesTable).values({ label: "Desiree" }).returning();
  const [cavendish] = await db.insert(varietiesTable).values({ label: "Cavendish" }).returning();
  const [russet] = await db.insert(varietiesTable).values({ label: "Russet Burbank" }).returning();
  const [desireeWt] = await db.insert(strainsTable).values({ varietyId: desiree.id, label: "WT" }).returning();
  const [desireeTc12] = await db.insert(strainsTable).values({ varietyId: desiree.id, label: "TC-12" }).returning();
  // Every variety needs at least one strain — per-strain minimum-stock/renewal
  // overrides and the aggregation on the variety page have nowhere to attach
  // otherwise. Varieties the lab doesn't distinguish within get "Standard".
  const [cavendishStandard] = await db.insert(strainsTable).values({ varietyId: cavendish.id, label: "Standard" }).returning();
  const [russetStandard] = await db.insert(strainsTable).values({ varietyId: russet.id, label: "Standard" }).returning();
  console.log("Created varieties: Desiree (strains WT, TC-12), Cavendish (Standard), Russet Burbank (Standard).");

  // --- Sample 1: multi-subcode lineage across three stages -----------------
  const sample1 = await createSample("FA", desiree.id, desireeWt.id, by);
  const s1b1 = await createInitiationBatch(
    sample1.id,
    { stage: "initiation", transferDate: "2026-01-10", medium: "MS", containerType: "magenta box", location: "Shelf A-1", initialQuantity: 10 },
    by,
  );
  const s1b2 = await subculture(
    s1b1,
    { consumedQuantity: 5, producedQuantity: 8, stage: "multiplication", transferDate: "2026-02-10", medium: "MS + 0.1mg/L BAP", location: "Shelf A-1" },
    by,
  );
  const s1b3 = await subculture(
    s1b2,
    { consumedQuantity: 3, producedQuantity: 3, stage: "rooting", transferDate: "2026-03-10", medium: "1/2 MS", containerType: "culture tube", location: "Shelf A-2" },
    by,
  );
  console.log(`${sample1.sampleCode}: initiation -> multiplication -> rooting (3 batches).`);

  // A storage batch below the default minimum stock (5) — recent, not overdue,
  // to demonstrate the low-stock warning independently of storage age.
  await subculture(
    s1b3,
    { consumedQuantity: 1, producedQuantity: 2, stage: "long-term storage", transferDate: "2026-06-01", location: "Freezer F-1" },
    by,
  );
  console.log(`${sample1.sampleCode}: storage batch with only 2 containers (below the default minimum of 5).`);

  // --- Sample 2: alert originates from a rescue (never from a discard),
  // clears after 2 consecutive clean transfers, then a later contaminated
  // discard on the now-clean batch sets had_contamination with NO new alert ---
  const sample2 = await createSample("FA", desiree.id, desireeTc12.id, by);
  const s2b1 = await createInitiationBatch(
    sample2.id,
    { stage: "initiation", transferDate: "2026-01-15", medium: "MS", containerType: "culture tube", location: "Shelf B-1", initialQuantity: 10 },
    by,
  );
  const s2b2 = await subculture(
    s2b1,
    { consumedQuantity: 6, producedQuantity: 6, stage: "multiplication", transferDate: "2026-02-15", location: "Shelf B-1" },
    by,
  );
  // Two containers show visible contamination and are discarded outright —
  // had_contamination on s2b2, no alert (never raised on the batch where
  // contamination was observed).
  await discard(s2b2, 2, "contaminated", "2026-02-20", by);
  // A third, separately-suspect container is rescued instead of discarded —
  // decontaminated and subcultured. Only the rescued batch carries the alert.
  const s2b3 = await rescue(
    s2b2,
    { consumedQuantity: 1, producedQuantity: 1, stage: "multiplication", transferDate: "2026-02-22", location: "Shelf B-1" },
    by,
  );
  const s2b4 = await subculture(
    s2b3,
    { consumedQuantity: 1, producedQuantity: 1, stage: "multiplication", transferDate: "2026-03-01", location: "Shelf B-1", appearedCleanAtTransfer: true },
    by,
  );
  const s2b5 = await subculture(
    s2b4,
    { consumedQuantity: 1, producedQuantity: 1, stage: "rooting", transferDate: "2026-03-20", location: "Shelf B-2", appearedCleanAtTransfer: true },
    by,
  );
  // Second consecutive clean transfer cleared the alert on s2b5. A later,
  // unrelated contaminated discard on this now-clean batch sets
  // had_contamination again but raises no new alert — the alert doesn't
  // come back just because material was later discarded as contaminated.
  await discard(s2b5, 1, "contaminated", "2026-04-10", by);
  console.log(
    `${sample2.sampleCode}: rescue on ${s2b2.subcode} raised the alert on ${s2b3.subcode}, cleared after 2 clean transfers on ${s2b5.subcode}, then a later contaminated discard left had_contamination with no new alert.`,
  );

  // --- Sample 3: a second, independent rescue lineage that hasn't cleared
  // yet — includes one non-clean transfer to show the streak resetting to 0
  // rather than clearing, contrasting with sample 2's fully-cleared chain ---
  const sample3 = await createSample("FA", cavendish.id, cavendishStandard.id, by);
  const s3b1 = await createInitiationBatch(
    sample3.id,
    { stage: "initiation", transferDate: "2025-04-01", medium: "MS", containerType: "magenta box", location: "Shelf C-1", initialQuantity: 10 },
    by,
  );
  const s3b2 = await subculture(
    s3b1,
    { consumedQuantity: 5, producedQuantity: 5, stage: "multiplication", transferDate: "2026-02-20", location: "Shelf C-1" },
    by,
  );
  // One container shows visible contamination and is discarded outright —
  // had_contamination on s3b2, no alert.
  await discard(s3b2, 1, "contaminated", "2026-03-01", by);
  // A second, separately-suspect container is rescued instead — the rescued
  // batch (not s3b2) carries the alert. The rescue's consumed quantity is the
  // suspect container itself, not leftover clean stock from the batch.
  const s3b3 = await rescue(
    s3b2,
    { consumedQuantity: 1, producedQuantity: 1, stage: "multiplication", transferDate: "2026-03-05", location: "Shelf C-2" },
    by,
  );
  // Still looks uncertain at the next transfer — the streak resets to 0
  // rather than clearing, and the alert stays raised.
  const s3b4 = await subculture(
    s3b3,
    { consumedQuantity: 1, producedQuantity: 1, stage: "multiplication", transferDate: "2026-03-15", location: "Shelf C-2", appearedCleanAtTransfer: false },
    by,
  );
  // One clean transfer since the reset — one more would clear it, but this
  // lineage is deliberately left active/uncleared for testing.
  await subculture(
    s3b4,
    { consumedQuantity: 1, producedQuantity: 1, stage: "rooting", transferDate: "2026-03-25", location: "Shelf C-2", appearedCleanAtTransfer: true },
    by,
  );
  console.log(
    `${sample3.sampleCode}: rescue on ${s3b2.subcode} raised the alert on ${s3b3.subcode}; still active after a reset and one clean transfer.`,
  );

  // A storage batch well past the default 6-month renewal interval — healthy
  // quantity, to demonstrate storage age overdue independently of low stock.
  await subculture(
    s3b1,
    { consumedQuantity: 2, producedQuantity: 8, stage: "long-term storage", transferDate: "2025-05-01", location: "Freezer F-1" },
    by,
  );
  console.log(`${sample3.sampleCode}: storage batch transferred 2025-05-01 — well overdue for renewal.`);

  // --- Sample 4: fully discarded, depleted batch ----------------------------
  const sample4 = await createSample("FA", russet.id, russetStandard.id, by);
  const s4b1 = await createInitiationBatch(
    sample4.id,
    { stage: "initiation", transferDate: "2026-01-05", medium: "MS + glycerol", containerType: "cryovial", location: "Freezer F-1", initialQuantity: 5 },
    by,
  );
  await discard(s4b1, 5, "poor growth", "2026-04-01", by);
  console.log(`${sample4.sampleCode}: batch ${s4b1.subcode} fully discarded (depleted, computed count 0).`);

  // --- Pooling: a batch with two parents, each contributing recorded stock ---
  const pooled = await poolBatches(
    [
      { batch: s1b1, consumedQuantity: 2 },
      { batch: s1b2, consumedQuantity: 2 },
    ],
    { stage: "multiplication", transferDate: "2026-04-01", medium: "MS", containerType: "magenta box", location: "Shelf A-1", producedQuantity: 4 },
    by,
  );
  console.log(`${sample1.sampleCode}: batch ${pooled.subcode} pooled from two parent batches (2 containers each).`);

  console.log(`Created user: ${tech.username} (user role, for testing non-admin access).`);
}

main()
  .then(async () => {
    console.log("Seed complete.");
    await pool.end();
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await pool.end();
    process.exit(1);
  });
