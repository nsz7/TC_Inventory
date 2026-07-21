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
import { eq, and } from "drizzle-orm";

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

  await db.insert(containerEventsTable).values({
    batchId: source.id,
    eventType: "transfer_out",
    quantity: output.consumedQuantity,
    targetBatchId: child.id,
    eventDate: output.transferDate,
    createdBy,
  });
  await db.insert(batchLineageTable).values({ childBatchId: child.id, parentBatchId: source.id });
  return child;
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
    await db.update(batchesTable).set({ hadContamination: true, updatedBy: createdBy }).where(eq(batchesTable.id, batch.id));
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
    eventType: "transfer_out",
    quantity: fields.consumedQuantity,
    targetBatchId: child.id,
    eventDate: fields.transferDate,
    createdBy,
  });
  await db.insert(batchLineageTable).values({ childBatchId: child.id, parentBatchId: source.id });
  await db.update(batchesTable).set({ hadContamination: true, updatedBy: createdBy }).where(eq(batchesTable.id, source.id));
  return child;
}

// --- Lookup list defaults (mirrors artifacts/api-server/src/routes/options.ts) ---

const DEFAULT_OPTIONS: Record<string, string[]> = {
  stage: ["initiation", "multiplication", "rooting", "acclimatization", "revitalization", "long-term storage"],
  container: ["culture tube", "magenta box", "petri dish", "jar", "flask", "cryovial", "other"],
  media: ["MS", "MS + 0.1mg/L BAP", "MS + 1mg/L BAP", "WPM", "B5", "1/2 MS", "MS + glycerol"],
  location: ["Shelf A-1", "Shelf A-2", "Shelf B-1", "Shelf C-1", "Shelf C-2", "Freezer F-1"],
  category_code: ["FA", "BC", "CV"],
  discard_reason: ["contaminated", "poor growth", "used in experiment", "other"],
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

async function main() {
  const [existingAdmin] = await db.select().from(usersTable).where(eq(usersTable.username, "admin"));
  if (existingAdmin) {
    console.log("Seed data already present (admin user exists) — skipping.");
    return;
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
  console.log("Created varieties: Desiree (strains WT, TC-12), Cavendish, Russet Burbank.");

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
  await subculture(
    s1b2,
    { consumedQuantity: 3, producedQuantity: 3, stage: "rooting", transferDate: "2026-03-10", medium: "1/2 MS", containerType: "culture tube", location: "Shelf A-2" },
    by,
  );
  console.log(`${sample1.sampleCode}: initiation -> multiplication -> rooting (3 batches).`);

  // --- Sample 2: contamination alert raised, then cleared after 2 clean transfers ---
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
  await discard(s2b2, 2, "contaminated", "2026-02-20", by);
  // Simulates the user confirming the "raise alert?" prompt after the contaminated discard.
  const [s2b2Alerted] = await db
    .update(batchesTable)
    .set({ contaminationAlert: true, cleanTransferCount: 0, updatedBy: by })
    .where(eq(batchesTable.id, s2b2.id))
    .returning();
  const s2b3 = await subculture(
    s2b2Alerted,
    { consumedQuantity: 2, producedQuantity: 2, stage: "multiplication", transferDate: "2026-03-01", location: "Shelf B-1", appearedCleanAtTransfer: true },
    by,
  );
  // Second consecutive clean transfer clears the alert on the resulting batch.
  await subculture(
    s2b3,
    { consumedQuantity: 1, producedQuantity: 1, stage: "rooting", transferDate: "2026-03-20", location: "Shelf B-2", appearedCleanAtTransfer: true },
    by,
  );
  console.log(`${sample2.sampleCode}: contamination alert raised on batch ${s2b3.subcode}'s parent, cleared on batch after 2 clean transfers.`);

  // --- Sample 3: rescue lineage (contaminated batch -> decontaminated child) ---
  const sample3 = await createSample("FA", cavendish.id, null, by);
  const s3b1 = await createInitiationBatch(
    sample3.id,
    { stage: "initiation", transferDate: "2026-01-20", medium: "MS", containerType: "magenta box", location: "Shelf C-1", initialQuantity: 10 },
    by,
  );
  const s3b2 = await subculture(
    s3b1,
    { consumedQuantity: 5, producedQuantity: 5, stage: "multiplication", transferDate: "2026-02-20", location: "Shelf C-1" },
    by,
  );
  await discard(s3b2, 1, "contaminated", "2026-03-01", by);
  await rescue(
    s3b2,
    { consumedQuantity: 3, producedQuantity: 2, stage: "multiplication", transferDate: "2026-03-05", location: "Shelf C-2" },
    by,
  );
  console.log(`${sample3.sampleCode}: contaminated batch ${s3b2.subcode} rescued into a new decontaminated batch.`);

  // --- Sample 4: fully discarded, depleted batch ----------------------------
  const sample4 = await createSample("FA", russet.id, null, by);
  const s4b1 = await createInitiationBatch(
    sample4.id,
    { stage: "initiation", transferDate: "2026-01-05", medium: "MS + glycerol", containerType: "cryovial", location: "Freezer F-1", initialQuantity: 5 },
    by,
  );
  await discard(s4b1, 5, "poor growth", "2026-04-01", by);
  console.log(`${sample4.sampleCode}: batch ${s4b1.subcode} fully discarded (depleted, computed count 0).`);

  // --- Pooling: a batch with two parents (schema demo; the pooling action itself is Part 2) ---
  const pooled = await createInitiationBatch(
    sample1.id,
    { stage: "multiplication", transferDate: "2026-04-01", medium: "MS", containerType: "magenta box", location: "Shelf A-1", initialQuantity: 4 },
    by,
  );
  await db.insert(batchLineageTable).values([
    { childBatchId: pooled.id, parentBatchId: s1b2.id },
    { childBatchId: pooled.id, parentBatchId: s1b1.id },
  ]);
  console.log(`${sample1.sampleCode}: batch ${pooled.subcode} pooled from two parent batches.`);

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
