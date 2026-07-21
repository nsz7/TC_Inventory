import { Router } from "express";
import { z } from "zod";
import { db, strainsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

const ListQuery = z.object({
  varietyId: z.coerce.number().optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
});

router.get("/strains", async (req, res) => {
  const query = ListQuery.parse(req.query);
  const conditions = [];
  if (query.varietyId !== undefined) conditions.push(eq(strainsTable.varietyId, query.varietyId));
  if (!query.includeInactive) conditions.push(eq(strainsTable.active, true));

  const rows = await db
    .select()
    .from(strainsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(strainsTable.label));
  res.json(rows);
});

const CreateBody = z.object({ varietyId: z.number(), label: z.string().min(1) });

// Any authenticated user can add a strain inline while creating a sample.
router.post("/strains", async (req, res) => {
  const body = CreateBody.parse(req.body);
  const [created] = await db.insert(strainsTable).values(body).returning();
  res.status(201).json(created);
});

const UpdateBody = z.object({
  label: z.string().min(1).optional(),
  active: z.boolean().optional(),
  minStorageStockOverride: z.number().int().nullish(),
  storageRenewalIntervalMonthsOverride: z.number().int().nullish(),
});

router.patch("/strains/:id", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = UpdateBody.parse(req.body);
  const [updated] = await db.update(strainsTable).set(body).where(eq(strainsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Strain not found" });
    return;
  }
  res.json(updated);
});

export default router;
