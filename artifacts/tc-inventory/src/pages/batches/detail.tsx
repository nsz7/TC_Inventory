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
import { ArrowRightLeft, Trash2, ChevronRight, AlertTriangle, History, Network, Pencil, Split } from "lucide-react";
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

interface OriginParent {
  sampleCode: string;
  subcode: string;
  usedFromSource: number | null;
}

interface TimelineEntry {
  kind: "event" | "field_change" | "origin";
  id: number | string;
  userDisplayName: string | null;
  // event — eventDate is when it happened (primary); recordedAt is when
  // this row was entered (secondary). They can genuinely differ: catching
  // up on a few days of paper records is ordinary lab work.
  eventType?: "transfer_out" | "discard" | "correction" | "subculture";
  quantity?: number;
  reason?: string | null;
  eventDate?: string;
  recordedAt?: string;
  note?: string | null;
  targetSubcode?: string | null;
  isRescue?: boolean;
  // field_change — a single date: an edit happens at the moment it's
  // recorded, so there's nothing to split.
  occurredAt?: string;
  fieldName?: string;
  oldValue?: string | null;
  newValue?: string | null;
  // origin — always sorted to the very bottom of the timeline by the API,
  // regardless of date, since it's the oldest fact about this batch there
  // is. alertInherited is only meaningful when this batch's alert is set
  // and isRescue is false — the two ways an alert can exist at creation.
  alertInherited?: boolean;
  totalProduced?: number;
  parents?: OriginParent[];
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

/** Wraps an event description with its two-part date: the event date
 * prominent (what actually happened, and when), the recording time small
 * and secondary (who typed it in, and when they got to it). These can
 * differ — entering a few days of paper records in one sitting is ordinary
 * lab work — so collapsing them into one date would show the wrong one. */
function EventRow({ icon, description, entry }: { icon: React.ReactNode; description: React.ReactNode; entry: TimelineEntry }) {
  const eventWhen = entry.eventDate ? format(parseLocalDate(entry.eventDate), "MMM d, yyyy") : "—";
  const recordedWhen = entry.recordedAt ? format(new Date(entry.recordedAt), "MMM d") : null;
  const who = entry.userDisplayName ?? "Unknown";

  return (
    <div className="flex items-start gap-2 py-2 border-b last:border-0">
      {icon}
      <div>
        <p className="text-sm">
          {description} — {eventWhen}
        </p>
        {recordedWhen && <p className="text-xs text-muted-foreground">recorded {recordedWhen} by {who}</p>}
      </div>
    </div>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "origin") {
    const parents = entry.parents ?? [];
    const parentText = parents
      .map((p) => `${p.sampleCode}-${p.subcode}${p.usedFromSource ? ` (${p.usedFromSource} used from source)` : ""}`)
      .join(" and ");
    const description = entry.isRescue ? (
      <>Created by rescuing contaminated material from {parentText} — alert raised</>
    ) : (
      <>
        {entry.totalProduced} container{entry.totalProduced === 1 ? "" : "s"} created from {parentText}
        {entry.alertInherited && (
          <>
            {" "}
            — alert inherited{parents.length === 1 ? ` from ${parents[0]!.sampleCode}-${parents[0]!.subcode}` : ""}
          </>
        )}
      </>
    );
    return (
      <EventRow
        entry={entry}
        icon={entry.isRescue ? <Split className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /> : <Split className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
        description={description}
      />
    );
  }
  if (entry.kind === "event") {
    if (entry.eventType === "subculture") {
      return (
        <EventRow
          entry={entry}
          icon={<Split className={`h-4 w-4 mt-0.5 shrink-0 ${entry.isRescue ? "text-amber-600" : "text-muted-foreground"}`} />}
          description={
            entry.isRescue ? (
              <>Rescued{entry.targetSubcode ? ` to -${entry.targetSubcode}` : ""} — alert raised</>
            ) : (
              <>Subcultured{entry.targetSubcode ? ` to -${entry.targetSubcode}` : ""}</>
            )
          }
        />
      );
    }
    if (entry.eventType === "transfer_out") {
      // A target_subcode means this is the legacy per-output-consumption
      // shape (one transfer_out per child). No target means this is the
      // operation-level "N containers used up" event that accompanies one
      // or more subculture records above — it never claims a single
      // destination, since the consumed containers didn't collectively
      // land in one place.
      return (
        <EventRow
          entry={entry}
          icon={<ArrowRightLeft className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
          description={
            entry.targetSubcode
              ? `Transferred ${entry.quantity} container${entry.quantity === 1 ? "" : "s"} to -${entry.targetSubcode}`
              : `${entry.quantity} container${entry.quantity === 1 ? "" : "s"} used up in this transfer`
          }
        />
      );
    }
    if (entry.eventType === "discard") {
      return (
        <EventRow
          entry={entry}
          icon={<Trash2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
          description={<>Discarded {entry.quantity}{entry.reason ? `, ${entry.reason}` : ""}</>}
        />
      );
    }
    return (
      <EventRow
        entry={entry}
        icon={<ArrowRightLeft className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
        description={
          <>
            Correction: {(entry.quantity ?? 0) > 0 ? "+" : ""}
            {entry.quantity} ({entry.reason})
          </>
        }
      />
    );
  }

  // field_change — a single date (occurredAt): an edit happens at the
  // moment it's recorded, so there's nothing to split into primary/secondary.
  const when = format(new Date(entry.occurredAt!), "MMM d, yyyy");
  const who = entry.userDisplayName ?? "Unknown";
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

// The API sorts ancestors/siblings/descendants by transfer date (not
// subcode — see the comment on that sort in routes/batches.ts), so the date
// needs to be visible here too, or a lower subcode appearing below a higher
// one just looks like a bug.
function LineageBatchLink({ batch }: { batch: Batch }) {
  return (
    <Link href={`/batches/${batch.id}`} className="block hover:underline">
      <span className="font-mono text-primary">{batch.subcode}</span>{" "}
      <span className="text-muted-foreground text-xs">{format(parseLocalDate(batch.transferDate), "MMM d, yyyy")}</span>
    </Link>
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
          <div className="col-span-2 sm:col-span-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Notes</p>
            <p className="text-sm mt-1.5 whitespace-pre-wrap">{batch.notes ?? "—"}</p>
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
                  lineageTree!.ancestors.map((b) => <LineageBatchLink key={b.id} batch={b} />)
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Siblings</p>
                {(lineageTree?.siblings ?? []).length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  lineageTree!.siblings.map((b) => <LineageBatchLink key={b.id} batch={b} />)
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Descendants</p>
                {(lineageTree?.descendants ?? []).length === 0 ? (
                  <p className="text-muted-foreground">None yet</p>
                ) : (
                  lineageTree!.descendants.map((b) => <LineageBatchLink key={b.id} batch={b} />)
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
