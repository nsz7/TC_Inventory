import { Router } from "express";
import { db } from "@workspace/db";
import { lookupOptionsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

const DEFAULT_STAGES = [
  "initiation",
  "multiplication",
  "rooting",
  "acclimatization",
  "revitalization",
  "long-term storage",
];

const DEFAULT_CONTAINERS = [
  "culture tube",
  "magenta box",
  "petri dish",
  "jar",
  "flask",
  "cryovial",
  "other",
];

const DEFAULT_MEDIA = [
  "MS",
  "MS + 0.1mg/L BAP",
  "MS + 1mg/L BAP",
  "WPM",
  "B5",
  "1/2 MS",
];

/** Seed defaults if the category has no entries yet */
async function seedIfEmpty(category: string, defaults: string[]) {
  const existing = await db
    .select()
    .from(lookupOptionsTable)
    .where(eq(lookupOptionsTable.category, category));
  if (existing.length === 0) {
    await db.insert(lookupOptionsTable).values(
      defaults.map((label, i) => ({ category, label, sortOrder: i })),
    );
  }
}

export async function seedOptions() {
  await seedIfEmpty("stage", DEFAULT_STAGES);
  await seedIfEmpty("container", DEFAULT_CONTAINERS);
  await seedIfEmpty("media", DEFAULT_MEDIA);
}

router.get("/options", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const rows = await db
    .select()
    .from(lookupOptionsTable)
    .where(category ? eq(lookupOptionsTable.category, category) : undefined)
    .orderBy(asc(lookupOptionsTable.sortOrder), asc(lookupOptionsTable.createdAt));
  res.json(rows);
});

router.post("/options", async (req, res) => {
  const { category, label } = req.body as { category?: string; label?: string };
  if (!category || !label) {
    res.status(400).json({ error: "category and label are required" });
    return;
  }
  const existing = await db
    .select()
    .from(lookupOptionsTable)
    .where(eq(lookupOptionsTable.category, category));
  const [created] = await db
    .insert(lookupOptionsTable)
    .values({ category, label, sortOrder: existing.length })
    .returning();
  res.status(201).json(created);
});

router.delete("/options/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  await db.delete(lookupOptionsTable).where(eq(lookupOptionsTable.id, id));
  res.status(204).send();
});

export default router;
