import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useOptions } from "@/hooks/use-options";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VesselAdjustDialog } from "@/components/vessel-adjust-dialog";
import { Search, Plus, ChevronRight, History, AlertTriangle } from "lucide-react";

interface SampleRow {
  id: number;
  sampleCode: string;
  varietyLabel: string | null;
  strainLabel: string | null;
  archived: boolean;
  voided: boolean;
  hadContaminationRollup: boolean;
}

interface BatchRow {
  id: number;
  sampleId: number;
  sampleCode: string;
  subcode: string;
  stage: string;
  location: string;
  containerType: string | null;
  notes: string | null;
  dueDateOverride: string | null;
  computedDueDate: string | null;
  computedQuantity: string;
  contaminationAlert: boolean;
  hadContamination: boolean;
  voided: boolean;
}

interface StageOption {
  id: number;
  label: string;
}

type ViewMode = "compact" | "detail" | "edit";

function HadContaminationMark() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" data-testid="mark-had-contamination" />
      </TooltipTrigger>
      <TooltipContent>Had contamination at some point — a historical fact, not an active warning.</TooltipContent>
    </Tooltip>
  );
}

function ContaminationAlertMark() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" data-testid="mark-contamination-alert" />
      </TooltipTrigger>
      <TooltipContent>Contamination alert — this batch came from rescued material and hasn't cleared yet.</TooltipContent>
    </Tooltip>
  );
}

function VesselCount({ quantity }: { quantity: number }) {
  return quantity > 0 ? (
    <span className="tabular-nums font-semibold text-sm">{quantity}</span>
  ) : (
    <span className="text-muted-foreground/40 text-sm">—</span>
  );
}

/** Inline-editable Vessels input. Never commits a number directly — it only
 * reports the requested new quantity upward, where it is turned into a
 * discard or correction event (see VesselAdjustDialog). */
function VesselsEditCell({
  batch,
  draftValue,
  onDraftChange,
  onCommit,
}: {
  batch: BatchRow;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onCommit: (newQuantity: number) => void;
}) {
  function commit() {
    const parsed = Number(draftValue);
    if (!Number.isInteger(parsed) || parsed < 0) {
      onDraftChange(String(Number(batch.computedQuantity)));
      return;
    }
    onCommit(parsed);
  }

  return (
    <Input
      type="number"
      min={0}
      className="w-20 h-8 tabular-nums"
      value={draftValue}
      onChange={(e) => onDraftChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      data-testid={`input-vessels-${batch.sampleCode}-${batch.subcode}`}
    />
  );
}

function NextDateCell({ batch }: { batch: BatchRow }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const initial = (batch.dueDateOverride ?? batch.computedDueDate ?? "").slice(0, 10);
  const [value, setValue] = useState(initial);

  useEffect(() => setValue(initial), [initial]);

  const patch = useMutation({
    mutationFn: (dueDateOverride: string | null) =>
      apiFetch(`/api/batches/${batch.id}`, { method: "PATCH", body: JSON.stringify({ dueDateOverride }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["samples"] });
      queryClient.invalidateQueries({ queryKey: ["batch", batch.id] });
      queryClient.invalidateQueries({ queryKey: ["batch-timeline", batch.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      setValue(initial);
      toast({
        title: "Could not update next date",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  function commit() {
    if (value === initial) return;
    patch.mutate(value || null);
  }

  return (
    <Input
      type="date"
      className="w-36 h-8"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      data-testid={`input-next-date-${batch.sampleCode}-${batch.subcode}`}
    />
  );
}

function NotesCell({ batch }: { batch: BatchRow }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const initial = batch.notes ?? "";
  const [value, setValue] = useState(initial);

  useEffect(() => setValue(initial), [initial]);

  const patch = useMutation({
    mutationFn: (notes: string | null) =>
      apiFetch(`/api/batches/${batch.id}`, { method: "PATCH", body: JSON.stringify({ notes }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["samples"] });
      queryClient.invalidateQueries({ queryKey: ["batch", batch.id] });
      queryClient.invalidateQueries({ queryKey: ["batch-timeline", batch.id] });
    },
    onError: (error) => {
      setValue(initial);
      toast({
        title: "Could not update notes",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  function commit() {
    if (value === initial) return;
    patch.mutate(value || null);
  }

  return (
    <Input
      className="min-w-[10rem] h-8"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      data-testid={`input-notes-${batch.sampleCode}-${batch.subcode}`}
    />
  );
}

export default function SamplesList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [hideArchived, setHideArchived] = useState(true);
  const [hideZeroVessels, setHideZeroVessels] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [vesselDrafts, setVesselDrafts] = useState<Record<number, string>>({});
  const [pendingAdjust, setPendingAdjust] = useState<{
    batchId: number;
    batchLabel: string;
    currentQuantity: number;
    newQuantity: number;
  } | null>(null);
  const [pendingZeroConfirm, setPendingZeroConfirm] = useState<{
    batchId: number;
    batchLabel: string;
    currentQuantity: number;
  } | null>(null);

  const { data: samples, isLoading: samplesLoading } = useQuery({
    queryKey: ["samples", { includeArchived: true }],
    queryFn: () => apiFetch<SampleRow[]>("/api/samples?includeArchived=true"),
  });
  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: () => apiFetch<BatchRow[]>("/api/batches"),
  });
  const { data: stageOptions } = useOptions("stage");

  const isLoading = samplesLoading || batchesLoading;

  const sampleById = useMemo(() => new Map((samples ?? []).map((s) => [s.id, s])), [samples]);

  const batchesBySample = useMemo(() => {
    const map = new Map<number, BatchRow[]>();
    for (const b of batches ?? []) {
      map.set(b.sampleId, [...(map.get(b.sampleId) ?? []), b]);
    }
    for (const list of map.values()) list.sort((a, b) => a.subcode.localeCompare(b.subcode));
    return map;
  }, [batches]);

  const stages = useMemo(() => (stageOptions ?? []).map((s: StageOption) => s.label), [stageOptions]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (samples ?? [])
      .filter((s) => {
        if (s.voided) return false;
        if (hideArchived && s.archived) return false;
        if (q) {
          const hay = `${s.sampleCode} ${s.varietyLabel ?? ""} ${s.strainLabel ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (stageFilter !== "all") {
          const sampleBatches = batchesBySample.get(s.id) ?? [];
          if (!sampleBatches.some((b) => b.stage === stageFilter)) return false;
        }
        return true;
      })
      .sort((a, b) => a.sampleCode.localeCompare(b.sampleCode));
  }, [samples, search, hideArchived, stageFilter, batchesBySample]);

  const flatBatchRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (batches ?? [])
      .filter((b) => !b.voided)
      .filter((b) => {
        const sample = sampleById.get(b.sampleId);
        if (!sample || sample.voided) return false;
        if (hideArchived && sample.archived) return false;
        if (stageFilter !== "all" && b.stage !== stageFilter) return false;
        if (hideZeroVessels && Number(b.computedQuantity) === 0) return false;
        if (q) {
          const hay = `${sample.sampleCode} ${b.subcode} ${sample.varietyLabel ?? ""} ${sample.strainLabel ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => `${a.sampleCode}-${a.subcode}`.localeCompare(`${b.sampleCode}-${b.subcode}`));
  }, [batches, sampleById, search, hideArchived, stageFilter, hideZeroVessels]);

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function stageTotal(sampleBatches: BatchRow[], stage: string) {
    return sampleBatches
      .filter((b) => !b.voided && b.stage === stage)
      .reduce((sum, b) => sum + Number(b.computedQuantity), 0);
  }

  function requestVesselChange(batch: BatchRow, newQuantity: number) {
    const currentQuantity = Number(batch.computedQuantity);
    if (newQuantity === currentQuantity) return;
    const batchLabel = `${batch.sampleCode}-${batch.subcode}`;
    if (newQuantity === 0) {
      setPendingZeroConfirm({ batchId: batch.id, batchLabel, currentQuantity });
    } else {
      setPendingAdjust({ batchId: batch.id, batchLabel, currentQuantity, newQuantity });
    }
  }

  function revertVesselDraft(batchId: number, currentQuantity: number) {
    setVesselDrafts((prev) => ({ ...prev, [batchId]: String(currentQuantity) }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Samples</h1>
          <p className="text-muted-foreground mt-1">Inventory at a glance</p>
        </div>
        <Link href="/samples/new">
          <Button data-testid="button-new-sample">
            <Plus className="mr-2 h-4 w-4" />
            New Sample
          </Button>
        </Link>
      </div>

      <div className="space-y-3 bg-card p-4 rounded-lg border">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by code, variety, strain…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-stage-filter">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage} value={stage} className="capitalize">
                  {stage}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as ViewMode)}
            className="border rounded-md p-0.5"
          >
            <ToggleGroupItem value="compact" size="sm" data-testid="button-view-compact">
              Compact
            </ToggleGroupItem>
            <ToggleGroupItem value="detail" size="sm" data-testid="button-view-detail">
              Detail
            </ToggleGroupItem>
            <ToggleGroupItem value="edit" size="sm" data-testid="button-view-edit">
              Edit
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={hideArchived} onCheckedChange={(v) => setHideArchived(!!v)} id="hide-archived" />
            <Label htmlFor="hide-archived" className="text-sm cursor-pointer">
              Hide archived
            </Label>
          </label>
          {viewMode !== "compact" && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={hideZeroVessels} onCheckedChange={(v) => setHideZeroVessels(!!v)} id="hide-zero-vessels" />
              <Label htmlFor="hide-zero-vessels" className="text-sm cursor-pointer">
                Hide zero vessels
              </Label>
            </label>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {viewMode === "compact"
              ? `${rows.length} sample${rows.length !== 1 ? "s" : ""}`
              : `${flatBatchRows.length} batch${flatBatchRows.length !== 1 ? "es" : ""}`}
          </span>
        </div>
      </div>

      {viewMode === "compact" && (
        <div className="rounded-lg border bg-card overflow-x-auto">
          {isLoading ? (
            <div className="p-8 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No samples match the current filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Variety</TableHead>
                  {stages.map((stage) => (
                    <TableHead key={stage} className="text-center capitalize whitespace-nowrap">
                      {stage}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sample) => {
                  const sampleBatches = (batchesBySample.get(sample.id) ?? []).filter((b) => !b.voided);
                  const isExpanded = expanded.has(sample.id);
                  const multiBatch = sampleBatches.length > 1;
                  const onlyBatch = sampleBatches.length === 1 ? sampleBatches[0] : null;

                  return [
                    <TableRow
                      key={`${sample.id}-collapsed`}
                      className={`hover:bg-muted/50 ${isExpanded ? "bg-muted/20" : ""} ${multiBatch || onlyBatch ? "cursor-pointer" : ""}`}
                      onClick={() => {
                        if (multiBatch) toggleExpand(sample.id);
                        else if (onlyBatch) navigate(`/batches/${onlyBatch.id}`);
                      }}
                      data-testid={`sample-row-${sample.sampleCode}`}
                    >
                      <TableCell className="font-mono font-bold text-primary text-sm whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {multiBatch && (
                            <ChevronRight
                              className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            />
                          )}
                          {sample.sampleCode}
                          {sample.hadContaminationRollup && <HadContaminationMark />}
                          {sample.archived && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1">
                              Archived
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {sample.varietyLabel ?? "—"}
                        {sample.strainLabel && <span className="text-muted-foreground"> · {sample.strainLabel}</span>}
                      </TableCell>
                      {stages.map((stage) => (
                        <TableCell key={stage} className="text-center">
                          <VesselCount quantity={stageTotal(sampleBatches, stage)} />
                        </TableCell>
                      ))}
                    </TableRow>,
                    ...(isExpanded
                      ? sampleBatches.map((batch) => (
                          <TableRow
                            key={`${sample.id}-${batch.id}`}
                            className="cursor-pointer hover:bg-primary/5 bg-muted/10 border-l-2 border-l-primary/20"
                            onClick={() => navigate(`/batches/${batch.id}`)}
                            data-testid={`batch-row-${batch.sampleCode}-${batch.subcode}`}
                          >
                            <TableCell className="pl-8">
                              <div className="inline-flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-primary">{batch.subcode}</span>
                                {batch.hadContamination && <HadContaminationMark />}
                                {batch.contaminationAlert && <ContaminationAlertMark />}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{batch.location}</div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">—</TableCell>
                            {stages.map((stage) => (
                              <TableCell key={stage} className="text-center">
                                <VesselCount quantity={stage === batch.stage ? Number(batch.computedQuantity) : 0} />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      : []),
                  ];
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {viewMode === "detail" && (
        <div className="rounded-lg border bg-card overflow-x-auto">
          {isLoading ? (
            <div className="p-8 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : flatBatchRows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No batches match the current filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Variety</TableHead>
                  <TableHead className="capitalize">Stage</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead className="text-center">Vessels</TableHead>
                  <TableHead>Next date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatBatchRows.map((batch) => {
                  const sample = sampleById.get(batch.sampleId);
                  return (
                    <TableRow
                      key={batch.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/batches/${batch.id}`)}
                      data-testid={`detail-row-${batch.sampleCode}-${batch.subcode}`}
                    >
                      <TableCell className="font-mono text-sm font-semibold text-primary whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {batch.sampleCode}-{batch.subcode}
                          {batch.hadContamination && <HadContaminationMark />}
                          {batch.contaminationAlert && <ContaminationAlertMark />}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {sample?.varietyLabel ?? "—"}
                        {sample?.strainLabel && <span className="text-muted-foreground"> · {sample.strainLabel}</span>}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{batch.stage}</TableCell>
                      <TableCell className="text-sm">{batch.location}</TableCell>
                      <TableCell className="text-sm">{batch.containerType ?? "—"}</TableCell>
                      <TableCell className="text-center">
                        <VesselCount quantity={Number(batch.computedQuantity)} />
                      </TableCell>
                      <TableCell className="text-sm">{batch.computedDueDate ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[16rem] truncate">{batch.notes ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {viewMode === "edit" && (
        <div className="rounded-lg border bg-card overflow-x-auto">
          {isLoading ? (
            <div className="p-8 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : flatBatchRows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No batches match the current filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Variety</TableHead>
                  <TableHead className="capitalize">Stage</TableHead>
                  <TableHead className="text-center">Vessels</TableHead>
                  <TableHead>Next date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatBatchRows.map((batch) => {
                  const sample = sampleById.get(batch.sampleId);
                  const currentQuantity = Number(batch.computedQuantity);
                  return (
                    <TableRow key={batch.id} data-testid={`edit-row-${batch.sampleCode}-${batch.subcode}`}>
                      <TableCell className="font-mono text-sm font-semibold text-primary whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {batch.sampleCode}-{batch.subcode}
                          {batch.hadContamination && <HadContaminationMark />}
                          {batch.contaminationAlert && <ContaminationAlertMark />}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {sample?.varietyLabel ?? "—"}
                        {sample?.strainLabel && <span className="text-muted-foreground"> · {sample.strainLabel}</span>}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{batch.stage}</TableCell>
                      <TableCell className="text-center">
                        <VesselsEditCell
                          batch={batch}
                          draftValue={vesselDrafts[batch.id] ?? String(currentQuantity)}
                          onDraftChange={(v) => setVesselDrafts((prev) => ({ ...prev, [batch.id]: v }))}
                          onCommit={(newQuantity) => requestVesselChange(batch, newQuantity)}
                        />
                      </TableCell>
                      <TableCell>
                        <NextDateCell batch={batch} />
                      </TableCell>
                      <TableCell>
                        <NotesCell batch={batch} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentQuantity === 0}
                          onClick={() =>
                            setPendingAdjust({
                              batchId: batch.id,
                              batchLabel: `${batch.sampleCode}-${batch.subcode}`,
                              currentQuantity,
                              newQuantity: 0,
                            })
                          }
                          data-testid={`button-discard-remainder-${batch.sampleCode}-${batch.subcode}`}
                        >
                          Discard remainder
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <AlertDialog
        open={!!pendingZeroConfirm}
        onOpenChange={(open) => {
          if (!open && pendingZeroConfirm) {
            revertVesselDraft(pendingZeroConfirm.batchId, pendingZeroConfirm.currentQuantity);
            setPendingZeroConfirm(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reduce {pendingZeroConfirm?.batchLabel} to 0 vessels?</AlertDialogTitle>
            <AlertDialogDescription>
              This batch will drop out of view once "Hide zero vessels" is on. You'll still be asked for a reason on the next
              step.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingZeroConfirm) {
                  setPendingAdjust({ ...pendingZeroConfirm, newQuantity: 0 });
                  setPendingZeroConfirm(null);
                }
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pendingAdjust && (
        <VesselAdjustDialog
          batchId={pendingAdjust.batchId}
          batchLabel={pendingAdjust.batchLabel}
          currentQuantity={pendingAdjust.currentQuantity}
          newQuantity={pendingAdjust.newQuantity}
          open={!!pendingAdjust}
          onOpenChange={(open) => {
            if (!open) setPendingAdjust(null);
          }}
          onCancel={() => {
            revertVesselDraft(pendingAdjust.batchId, pendingAdjust.currentQuantity);
            setPendingAdjust(null);
          }}
        />
      )}
    </div>
  );
}
