import { useMemo, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { parseLocalDate } from "@/lib/dates";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useCurrentUser } from "@/hooks/use-auth";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRightLeft, Trash2, ChevronRight, AlertTriangle, History, Network, Pencil } from "lucide-react";
import { TransferDialog } from "@/components/transfer-dialog";
import { DiscardDialog } from "@/components/discard-dialog";
import { BatchEditDialog } from "@/components/batch-edit-dialog";

interface Batch {
  id: number;
  sampleId: number;
  sampleCode: string;
  varietyLabel: string | null;
  strainLabel: string | null;
  sampleArchived: boolean;
  subcode: string;
  stage: string;
  transferDate: string;
  medium: string | null;
  containerType: string | null;
  location: string;
  initialQuantity: number;
  computedQuantity: string;
  contaminationAlert: boolean;
  cleanTransferCount: number;
  hadContamination: boolean;
  notes: string | null;
  dueDateOverride: string | null;
  computedDueDate: string | null;
  voided: boolean;
  voidedReason: string | null;
}

interface TimelineEntry {
  kind: "event" | "field_change";
  id: number;
  occurredAt: string;
  userDisplayName: string | null;
  // event
  eventType?: "transfer_out" | "discard" | "correction";
  quantity?: number;
  reason?: string | null;
  eventDate?: string;
  note?: string | null;
  targetSubcode?: string | null;
  // field_change
  fieldName?: string;
  oldValue?: string | null;
  newValue?: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  transferDate: "Transfer date",
  stage: "Stage",
  medium: "Medium",
  containerType: "Container type",
  location: "Location",
  initialQuantity: "Initial quantity",
  contaminationAlert: "Contamination alert",
  variety: "Variety",
  strain: "Strain",
  archived: "Archived",
  archivedReason: "Archive reason",
  voided: "Voided",
  voidedReason: "Void reason",
};

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const when = format(new Date(entry.occurredAt), "MMM d, yyyy");
  const who = entry.userDisplayName ?? "Unknown";

  if (entry.kind === "event") {
    if (entry.eventType === "transfer_out") {
      return (
        <div className="flex items-start gap-2 py-2 border-b last:border-0">
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm">
            Transferred {entry.quantity} container{entry.quantity === 1 ? "" : "s"}
            {entry.targetSubcode ? ` to -${entry.targetSubcode}` : ""} —{" "}
            <span className="text-muted-foreground">{who}, {when}</span>
          </p>
        </div>
      );
    }
    if (entry.eventType === "discard") {
      return (
        <div className="flex items-start gap-2 py-2 border-b last:border-0">
          <Trash2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm">
            Discarded {entry.quantity}{entry.reason ? `, ${entry.reason}` : ""} —{" "}
            <span className="text-muted-foreground">{who}, {when}</span>
          </p>
        </div>
      );
    }
    return (
      <div className="flex items-start gap-2 py-2 border-b last:border-0">
        <ArrowRightLeft className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-sm">
          Correction: {(entry.quantity ?? 0) > 0 ? "+" : ""}
          {entry.quantity} ({entry.reason}) — <span className="text-muted-foreground">{who}, {when}</span>
        </p>
      </div>
    );
  }

  // field_change
  const isManualAlertOverride = entry.fieldName === "contaminationAlert";
  const label = FIELD_LABELS[entry.fieldName ?? ""] ?? entry.fieldName;

  if (isManualAlertOverride) {
    const raised = entry.newValue === "true";
    return (
      <div className="flex items-start gap-2 py-2 border-b last:border-0 bg-amber-50 dark:bg-amber-950/30 rounded px-2 -mx-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p>
            <Badge variant="outline" className="mr-1.5 text-[10px] uppercase tracking-wide border-amber-500 text-amber-700">
              Manual override
            </Badge>
            Contamination alert manually {raised ? "raised" : "cleared"} —{" "}
            <span className="text-muted-foreground">{who}, {when}</span>
          </p>
          <p className="text-muted-foreground mt-0.5">Reason: {entry.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-2 border-b last:border-0">
      <History className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <p className="text-sm">
        {label} changed {entry.oldValue ?? "—"} → {entry.newValue ?? "—"} —{" "}
        <span className="text-muted-foreground">{who}, {when}</span>
      </p>
    </div>
  );
}

export default function BatchDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const batchId = Number(params.id);
  const { data: currentUser } = useCurrentUser();
  const isDesktop = useIsDesktop();
  const pageSize = isDesktop ? 20 : 10;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [showFullTree, setShowFullTree] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: batch, isLoading: batchLoading } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => apiFetch<Batch>(`/api/batches/${batchId}`),
  });
  const { data: ancestors } = useQuery({
    queryKey: ["batch-ancestors", batchId],
    queryFn: () => apiFetch<Batch[]>(`/api/batches/${batchId}/ancestors`),
  });
  const { data: lineageTree } = useQuery({
    queryKey: ["batch-lineage-tree", batchId],
    queryFn: () => apiFetch<{ ancestors: Batch[]; siblings: Batch[]; descendants: Batch[] }>(`/api/batches/${batchId}/lineage-tree`),
    enabled: showFullTree,
  });
  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ["batch-timeline", batchId],
    queryFn: () => apiFetch<TimelineEntry[]>(`/api/batches/${batchId}/timeline`),
  });

  const lineChain = useMemo(() => [...(ancestors ?? [])].reverse(), [ancestors]);
  const computedQuantity = batch ? Number(batch.computedQuantity) : 0;
  const isDepleted = computedQuantity <= 0;

  if (batchLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!batch) return <p className="text-muted-foreground p-8">Batch not found.</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
            <span className="font-mono">{batch.sampleCode}-{batch.subcode}</span>
            {batch.contaminationAlert && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Contamination alert
              </Badge>
            )}
            {batch.hadContamination && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <History className="h-3 w-3" />
                Had contamination
              </Badge>
            )}
            {batch.voided && <Badge variant="secondary">Voided</Badge>}
          </h1>
          <p className="text-muted-foreground mt-1">
            <Link href={`/samples/${batch.sampleId}`} className="hover:underline">
              {batch.varietyLabel ?? "—"}
              {batch.strainLabel && <> · {batch.strainLabel}</>}
            </Link>
            {" · "}
            <span className="capitalize">{batch.stage}</span> · {batch.location}
          </p>
        </div>
        {!batch.voided && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)} data-testid="button-edit-batch">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setDiscardOpen(true)} disabled={isDepleted} data-testid="button-discard">
              <Trash2 className="mr-2 h-4 w-4" />
              Discard
            </Button>
            <Button onClick={() => setTransferOpen(true)} disabled={isDepleted} data-testid="button-transfer">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transfer
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Current count</p>
            <p className="text-2xl font-bold tabular-nums">{computedQuantity}</p>
            {isDepleted && <p className="text-xs text-muted-foreground">Depleted</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Initial quantity</p>
            <p className="text-2xl font-bold tabular-nums">{batch.initialQuantity}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Transfer date</p>
            <p className="text-sm mt-1.5">{format(parseLocalDate(batch.transferDate), "MMM d, yyyy")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Medium / Container</p>
            <p className="text-sm mt-1.5">{batch.medium ?? "—"} / {batch.containerType ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Due date</p>
            <p className="text-sm mt-1.5">
              {batch.computedDueDate ? format(parseLocalDate(batch.computedDueDate), "MMM d, yyyy") : "No default set"}
              {batch.dueDateOverride && <span className="text-muted-foreground"> (override)</span>}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Lineage</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowFullTree((v) => !v)} data-testid="button-toggle-lineage-tree">
            <Network className="mr-2 h-3.5 w-3.5" />
            {showFullTree ? "Hide full tree" : "View full lineage tree"}
          </Button>
        </CardHeader>
        <CardContent>
          {!showFullTree ? (
            <div className="flex items-center gap-1.5 flex-wrap text-sm">
              {lineChain.map((b, i) => (
                <span key={b.id} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  {b.id === batch.id ? (
                    <span className="font-mono font-semibold">{b.subcode}</span>
                  ) : (
                    <Link href={`/batches/${b.id}`} className="font-mono text-primary hover:underline">
                      {b.subcode}
                    </Link>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Ancestors</p>
                {(lineageTree?.ancestors ?? []).length === 0 ? (
                  <p className="text-muted-foreground">None — initiation batch</p>
                ) : (
                  lineageTree!.ancestors.map((b) => (
                    <Link key={b.id} href={`/batches/${b.id}`} className="block font-mono text-primary hover:underline">
                      {b.subcode}
                    </Link>
                  ))
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Siblings</p>
                {(lineageTree?.siblings ?? []).length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  lineageTree!.siblings.map((b) => (
                    <Link key={b.id} href={`/batches/${b.id}`} className="block font-mono text-primary hover:underline">
                      {b.subcode}
                    </Link>
                  ))
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Descendants</p>
                {(lineageTree?.descendants ?? []).length === 0 ? (
                  <p className="text-muted-foreground">None yet</p>
                ) : (
                  lineageTree!.descendants.map((b) => (
                    <Link key={b.id} href={`/batches/${b.id}`} className="block font-mono text-primary hover:underline">
                      {b.subcode}
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (timeline ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <>
              <div>
                {timeline!.slice(0, visibleCount).map((entry) => (
                  <TimelineRow key={`${entry.kind}-${entry.id}`} entry={entry} />
                ))}
              </div>
              {timeline!.length > visibleCount && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setVisibleCount((v) => v + pageSize)}>
                  Show older
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!batch.voided && (
        <>
          <TransferDialog
            batchId={batch.id}
            sourceSubcode={batch.subcode}
            sourceHasAlert={batch.contaminationAlert}
            maxQuantity={computedQuantity}
            open={transferOpen}
            onOpenChange={setTransferOpen}
          />
          <DiscardDialog batchId={batch.id} maxQuantity={computedQuantity} open={discardOpen} onOpenChange={setDiscardOpen} />
          <BatchEditDialog batch={batch} open={editOpen} onOpenChange={setEditOpen} />
        </>
      )}
    </div>
  );
}
