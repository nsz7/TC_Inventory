import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { KeyRound } from "lucide-react";

interface AccountRow {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "user";
  active: boolean;
}

function ResetPasswordDialog({ user, open, onOpenChange }: { user: AccountRow; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const reset = useMutation({
    mutationFn: () => apiFetch(`/api/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ password }) }),
    onSuccess: () => {
      toast({ title: "Password reset", description: `${user.displayName}'s password has been changed.` });
      setPassword("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ title: "Could not reset password", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password — {user.displayName}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length >= 8) reset.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              data-testid="input-reset-password"
            />
            <p className="text-xs text-muted-foreground">At least 8 characters. They'll need to sign in with this right away.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={password.length < 8 || reset.isPending} data-testid="button-confirm-reset-password">
              {reset.isPending ? "Resetting…" : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsers() {
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resetPasswordFor, setResetPasswordFor] = useState<AccountRow | null>(null);

  const { data: users, isLoading: usersLoading } = useQuery<AccountRow[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<AccountRow[]>("/api/users"),
    enabled: currentUser?.role === "admin",
  });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");

  const createUser = useMutation({
    mutationFn: () =>
      apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ username, password, displayName, role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setUsername("");
      setPassword("");
      setDisplayName("");
      setRole("user");
      toast({ title: "Account created" });
    },
    onError: (error) => {
      toast({
        title: "Could not create account",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, ...body }: { id: number; active?: boolean; role?: "admin" | "user" }) =>
      apiFetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
    onError: (error) => {
      toast({
        title: "Could not update account",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  if (currentUserLoading) return null;

  if (currentUser?.role !== "admin") {
    return <p className="text-muted-foreground p-8">Admin access required.</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-muted-foreground">Create and manage the other accounts for your team. No self-registration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New account</CardTitle>
          <CardDescription>The person can sign in with this username and password right away.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createUser.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-username">Username</Label>
                <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-display-name">Display name</Label>
                <Input id="new-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user")}>
                  <SelectTrigger id="new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  return (
                    <TableRow key={u.id} data-testid={`user-row-${u.username}`}>
                      <TableCell className="font-mono">{u.username}</TableCell>
                      <TableCell>{u.displayName}</TableCell>
                      <TableCell>
                        <Select value={u.role} onValueChange={(v) => updateUser.mutate({ id: u.id, role: v as "admin" | "user" })}>
                          <SelectTrigger className="w-28 h-8" data-testid={`select-role-${u.username}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.active ? "default" : "secondary"}>{u.active ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setResetPasswordFor(u)}
                          title="Reset password"
                          data-testid={`button-reset-password-${u.username}`}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 px-2 ${u.active ? "text-destructive hover:text-destructive hover:bg-destructive/10" : ""}`}
                          disabled={isSelf}
                          title={isSelf ? "Can't deactivate your own account" : u.active ? "Deactivate" : "Reactivate"}
                          onClick={() => updateUser.mutate({ id: u.id, active: !u.active })}
                          data-testid={`button-toggle-active-${u.username}`}
                        >
                          {u.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {resetPasswordFor && (
        <ResetPasswordDialog
          user={resetPasswordFor}
          open={!!resetPasswordFor}
          onOpenChange={(open) => {
            if (!open) setResetPasswordFor(null);
          }}
        />
      )}
    </div>
  );
}
