import { Router } from "express";
import { z } from "zod";
import { db, changeLogTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

const ListQuery = z.object({
  recordType: z.enum(["sample", "batch"]).optional(),
  recordId: z.coerce.number().optional(),
});

router.get("/change-log", async (req, res) => {
  const query = ListQuery.parse(req.query);
  const conditions = [];
  if (query.recordType) conditions.push(eq(changeLogTable.recordType, query.recordType));
  if (query.recordId !== undefined) conditions.push(eq(changeLogTable.recordId, query.recordId));

  const rows = await db
    .select({
      id: changeLogTable.id,
      recordType: changeLogTable.recordType,
      recordId: changeLogTable.recordId,
      fieldName: changeLogTable.fieldName,
      oldValue: changeLogTable.oldValue,
      newValue: changeLogTable.newValue,
      changedBy: changeLogTable.changedBy,
      changedByName: usersTable.displayName,
      changedAt: changeLogTable.changedAt,
    })
    .from(changeLogTable)
    .leftJoin(usersTable, eq(changeLogTable.changedBy, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(changeLogTable.changedAt));

  res.json(rows);
});

export default router;
