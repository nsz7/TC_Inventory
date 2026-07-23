import { Router } from "express";
import { z } from "zod";
import { db, lookupOptionsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

const DEFAULT_OPTIONS: Record<string, string[]> = {
  stage: ["initiation", "multiplication", "rooting", "acclimatization", "revitalization", "long-term storage"],
  container: ["culture tube", "magenta box", "petri dish", "jar", "flask", "cryovial", "other"],
  media: ["MS", "MS + 0.1mg/L BAP", "MS + 1mg/L BAP", "WPM", "B5", "1/2 MS"],
  location: ["Shelf A", "Shelf B", "Growth Room 1", "Growth Room 2"],
  category_code: ["FA", "BC", "CV"],
  discard_reason: ["contaminated", "poor growth", "used in experiment", "fully transferred — source retired", "other"],
  correction_reason: ["miscount", "previously unrecorded", "other"],
  archive_reason: ["line lost", "project ended", "transferred out", "other"],
};

async function seedIfEmpty(category: string, defaults: string[]) {
  const existing = await db.select().from(lookupOptionsTable).where(eq(lookupOptionsTable.category, category));
  if (existing.length === 0) {
    await db.insert(lookupOptionsTable).values(defaults.map((label, i) => ({ category, label, sortOrder: i })));
  }
}

export async function seedOptions() {
  for (const [category, defaults] of Object.entries(DEFAULT_OPTIONS)) {
    await seedIfEmpty(category, defaults);
  }
}

const ListOptionsQuery = z.object({
  category: z.string().optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
});

router.get("/options", async (req, res) => {
  const query = ListOptionsQuery.parse(req.query);
  const conditions = [];
  if (query.category) conditions.push(eq(lookupOptionsTable.category, query.category));
  if (!query.includeInactive) conditions.push(eq(lookupOptionsTable.active, true));

  const rows = await db
    .select()
    .from(lookupOptionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(lookupOptionsTable.sortOrder), asc(lookupOptionsTable.createdAt));
  res.json(rows);
});

const CreateOptionBody = z.object({ category: z.string().min(1), label: z.string().min(1) });

// Any authenticated user can add an entry inline while filling out a form
// (e.g. a new location); only Settings management (deactivating, editing)
// is admin-only.
router.post("/options", async (req, res) => {
  const body = CreateOptionBody.parse(req.body);
  const existing = await db
    .select()
    .from(lookupOptionsTable)
    .where(and(eq(lookupOptionsTable.category, body.category), eq(lookupOptionsTable.active, true)));
  const [created] = await db
    .insert(lookupOptionsTable)
    .values({ category: body.category, label: body.label, sortOrder: existing.length })
    .returning();
  res.status(201).json(created);
});

const UpdateOptionBody = z.object({
  label: z.string().min(1).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.patch("/options/:id", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = UpdateOptionBody.parse(req.body);
  const [updated] = await db.update(lookupOptionsTable).set(body).where(eq(lookupOptionsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Option not found" });
    return;
  }
  res.json(updated);
});

export default router;
