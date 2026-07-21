import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { recordActivity, sessionActivity, SESSION_TIMEOUT_MS, SESSION_WARNING_LEAD_MS } from "@/lib/session-activity";
import { useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "@/hooks/use-auth";

const CHECK_INTERVAL_MS = 5_000;

/** Warns ~2 minutes before the server's 30-minute inactivity timeout, and
 * logs out client-side if the user never acknowledges it. Mount once, near
 * the root, only while a user is logged in. */
export function SessionTimeoutWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const interval = setInterval(() => {
      const idleMs = Date.now() - sessionActivity.lastActivityAt;
      if (idleMs >= SESSION_TIMEOUT_MS) {
        setShowWarning(false);
        queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
      } else if (idleMs >= SESSION_TIMEOUT_MS - SESSION_WARNING_LEAD_MS) {
        setShowWarning(true);
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [queryClient]);

  async function stayLoggedIn() {
    try {
      await apiFetch("/api/auth/me");
      recordActivity();
    } catch {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
    }
    setShowWarning(false);
  }

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You'll be signed out soon</AlertDialogTitle>
          <AlertDialogDescription>
            You've been inactive for a while. You'll be automatically signed out in about 2 minutes to protect this
            shared device — click below to stay signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={stayLoggedIn}>Stay signed in</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
