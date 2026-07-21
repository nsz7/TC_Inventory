import bcrypt from "bcryptjs";
import type { RequestHandler } from "express";
import { db, usersTable, loginLogTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

declare module "express-session" {
  interface SessionData {
    userId?: number;
    loginLogId?: number;
    lastActivityAt?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

/**
 * Requires a logged-in, active user. Applies the 30-minute inactivity
 * timeout: if the gap since the last authenticated request on this session
 * exceeds SESSION_TIMEOUT_MS, the login_log row is closed out as a timeout
 * (not a manual logout) and the session is destroyed. This only fires on
 * the next request after the idle period — there is no server-side clock
 * closing out sessions that are never touched again.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const session = req.session;
  if (!session.userId || !session.loginLogId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const now = Date.now();
  if (session.lastActivityAt !== undefined && now - session.lastActivityAt > SESSION_TIMEOUT_MS) {
    const loginLogId = session.loginLogId;
    await db
      .update(loginLogTable)
      .set({ logoutAt: new Date(), logoutType: "timeout" })
      .where(eq(loginLogTable.id, loginLogId));
    session.destroy(() => {});
    res.status(401).json({ error: "Session expired" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user || !user.active) {
    res.status(401).json({ error: "Account is inactive" });
    return;
  }

  session.lastActivityAt = now;
  req.currentUser = user;
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.currentUser?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};

export function toPublicUser(user: User) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}
