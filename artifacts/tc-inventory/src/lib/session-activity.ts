/**
 * Tracks the last successful authenticated API response, so the frontend can
 * warn before the server's inactivity timeout fires rather than only finding
 * out after the fact via a 401. Mirrors SESSION_TIMEOUT_MS in
 * artifacts/api-server/src/lib/auth.ts — keep the two in sync.
 */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_WARNING_LEAD_MS = 2 * 60 * 1000;

export const sessionActivity = {
  lastActivityAt: Date.now(),
};

export function recordActivity() {
  sessionActivity.lastActivityAt = Date.now();
}
