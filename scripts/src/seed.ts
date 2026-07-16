import "./env";
import { db, pool, samplesTable, transfersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const exampleSamples = [
  {
    sampleCode: "FA26-001",
    cultivar: "Desiree",
    stage: "multiplication",
    mediaType: "MS",
    containerType: "magenta box",
    quantity: 10,
    location: "Shelf A-1",
    status: "active",
    dateInitiated: "2026-03-25",
    notes: "Example seed sample",
  },
  {
    sampleCode: "FA26-002",
    cultivar: "Atlantic",
    stage: "rooting",
    mediaType: "1/2 MS",
    containerType: "culture tube",
    quantity: 6,
    location: "Shelf B-2",
    status: "active",
    dateInitiated: "2026-04-01",
    notes: "Example seed sample",
  },
  {
    sampleCode: "FA26-003",
    cultivar: "Cavendish",
    stage: "long-term storage",
    mediaType: "MS + glycerol",
    containerType: "cryovial",
    quantity: 20,
    location: "Freezer F-1",
    status: "active",
    dateInitiated: "2026-01-05",
    notes: "Example seed sample",
  },
];

async function seed() {
  const inserted = await db
    .insert(samplesTable)
    .values(exampleSamples)
    .onConflictDoNothing({ target: samplesTable.sampleCode })
    .returning();
  console.log(
    inserted.length > 0
      ? `Inserted ${inserted.length} example sample(s).`
      : "Example samples already present, skipping.",
  );

  const [from] = await db
    .select()
    .from(samplesTable)
    .where(eq(samplesTable.sampleCode, "FA26-001"));
  const [to] = await db
    .select()
    .from(samplesTable)
    .where(eq(samplesTable.sampleCode, "FA26-002"));

  if (from && to) {
    const existingTransfer = await db
      .select()
      .from(transfersTable)
      .where(eq(transfersTable.fromSampleId, from.id));

    if (existingTransfer.length === 0) {
      await db.insert(transfersTable).values({
        fromSampleId: from.id,
        toSampleId: to.id,
        transferDate: "2026-04-01",
        fromLocation: from.location,
        toLocation: to.location,
        mediaType: to.mediaType,
        quantityTransferred: 2,
        technician: "Seed Script",
        notes: "Example seed transfer",
      });
      console.log("Inserted 1 example transfer.");
    } else {
      console.log("Example transfer already present, skipping.");
    }
  }
}

seed()
  .then(async () => {
    console.log("Seed complete.");
    await pool.end();
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await pool.end();
    process.exit(1);
  });
