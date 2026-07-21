import { Router } from "express";
import { z } from "zod";
import { db, varietiesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

const ListQuery = z.object({ includeInactive: z.coerce.boolean().optional().default(false) });

router.get("/varieties", async (req, res) => {
  const query = ListQuery.parse(req.query);
  const rows = await db
    .select()
    .from(varietiesTable)
    .where(query.includeInactive ? undefined : eq(varietiesTable.active, true))
    .orderBy(asc(varietiesTable.label));
  res.json(rows);
});

const CreateBody = z.object({ label: z.string().min(1) });

// Any authenticated user can add a variety inline while creating a sample.
router.post("/varieties", async (req, res) => {
  const body = CreateBody.parse(req.body);
  const [created] = await db.insert(varietiesTable).values({ label: body.label }).returning();
  res.status(201).json(created);
});

const UpdateBody = z.object({ label: z.string().min(1).optional(), active: z.boolean().optional() });

router.patch("/varieties/:id", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = UpdateBody.parse(req.body);
  const [updated] = await db.update(varietiesTable).set(body).where(eq(varietiesTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Variety not found" });
    return;
  }
  res.json(updated);
});

export default router;
