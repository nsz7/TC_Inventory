import { Router } from "express";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin, hashPassword, toPublicUser } from "../lib/auth";

const router = Router();

router.get("/users", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(usersTable).orderBy(asc(usersTable.username));
  res.json(rows.map(toPublicUser));
});

const CreateUserBody = z.object({
  username: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1),
  role: z.enum(["admin", "user"]).default("user"),
});

router.post("/users", requireAdmin, async (req, res) => {
  const body = CreateUserBody.parse(req.body);
  const passwordHash = await hashPassword(body.password);
  const [created] = await db
    .insert(usersTable)
    .values({
      username: body.username,
      passwordHash,
      displayName: body.displayName,
      role: body.role,
      createdBy: req.currentUser!.id,
    })
    .returning();
  res.status(201).json(toPublicUser(created));
});

const UpdateUserBody = z.object({
  displayName: z.string().min(1).optional(),
  role: z.enum(["admin", "user"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

router.patch("/users/:id", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = UpdateUserBody.parse(req.body);
  const { password, ...rest } = body;

  const [updated] = await db
    .update(usersTable)
    .set({
      ...rest,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    })
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(toPublicUser(updated));
});

export default router;
