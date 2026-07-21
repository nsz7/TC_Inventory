import { Router } from "express";
import { z } from "zod";
import { db, usersTable, loginLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, verifyPassword, toPublicUser } from "../lib/auth";

const router = Router();

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const body = LoginBody.parse(req.body);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, body.username));
  if (!user || !user.active) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const passwordOk = await verifyPassword(body.password, user.passwordHash);
  if (!passwordOk) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const [logEntry] = await db.insert(loginLogTable).values({ userId: user.id }).returning();

  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Could not start session" });
      return;
    }
    req.session.userId = user.id;
    req.session.loginLogId = logEntry.id;
    req.session.lastActivityAt = Date.now();
    res.json(toPublicUser(user));
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  const loginLogId = req.session.loginLogId;
  if (loginLogId !== undefined) {
    await db
      .update(loginLogTable)
      .set({ logoutAt: new Date(), logoutType: "manual" })
      .where(eq(loginLogTable.id, loginLogId));
  }
  req.session.destroy(() => {
    res.status(204).send();
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json(toPublicUser(req.currentUser!));
});

export default router;
