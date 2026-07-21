import { Router } from "express";
import { z } from "zod";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

const SETTINGS_ROW_ID = 1;

async function getOrCreateSettings() {
  const [existing] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, SETTINGS_ROW_ID));
  if (existing) return existing;
  const [created] = await db.insert(appSettingsTable).values({ id: SETTINGS_ROW_ID }).returning();
  return created;
}

router.get("/settings", requireAdmin, async (_req, res) => {
  res.json(await getOrCreateSettings());
});

const UpdateBody = z.object({
  defaultMinStorageStock: z.number().int().nonnegative().optional(),
  defaultStorageRenewalIntervalMonths: z.number().int().positive().optional(),
});

router.patch("/settings", requireAdmin, async (req, res) => {
  const body = UpdateBody.parse(req.body);
  await getOrCreateSettings();
  const [updated] = await db
    .update(appSettingsTable)
    .set({ ...body, updatedBy: req.currentUser!.id, updatedAt: new Date() })
    .where(eq(appSettingsTable.id, SETTINGS_ROW_ID))
    .returning();
  res.json(updated);
});

export default router;
