import { Router } from "express";
import { z } from "zod";
import { db, stageIntervalsTable, lookupOptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

// Long-term storage has its own months-based global/per-strain precedence
// (see appSettings/strains) and isn't part of this per-stage-days list.
const EXCLUDED_STAGE = "long-term storage";

/**
 * Every active stage gets a row, synthesized on the fly for any stage that
 * doesn't have one yet (a newly added stage, or before this feature seeded
 * one) rather than requiring a separate provisioning step. Nothing is
 * written until an admin actually sets a value via PATCH.
 */
router.get("/stage-intervals", requireAdmin, async (_req, res) => {
  const [stages, intervals] = await Promise.all([
    db
      .select({ label: lookupOptionsTable.label })
      .from(lookupOptionsTable)
      .where(and(eq(lookupOptionsTable.category, "stage"), eq(lookupOptionsTable.active, true))),
    db.select().from(stageIntervalsTable),
  ]);
  const byStage = new Map(intervals.map((i) => [i.stage, i]));
  const rows = stages
    .filter((s) => s.label !== EXCLUDED_STAGE)
    .map(
      (s) =>
        byStage.get(s.label) ?? {
          stage: s.label,
          intervalDays: null,
          isPlaceholder: true,
          updatedBy: null,
          updatedAt: null,
        },
    );
  res.json(rows);
});

const UpdateBody = z.object({ intervalDays: z.number().int().positive() });

router.patch("/stage-intervals/:stage", requireAdmin, async (req, res) => {
  const stage = z.string().min(1).parse(req.params.stage);
  const body = UpdateBody.parse(req.body);
  const [updated] = await db
    .insert(stageIntervalsTable)
    .values({ stage, intervalDays: body.intervalDays, isPlaceholder: false, updatedBy: req.currentUser!.id })
    .onConflictDoUpdate({
      target: stageIntervalsTable.stage,
      set: { intervalDays: body.intervalDays, isPlaceholder: false, updatedBy: req.currentUser!.id, updatedAt: new Date() },
    })
    .returning();
  res.json(updated);
});

export default router;
