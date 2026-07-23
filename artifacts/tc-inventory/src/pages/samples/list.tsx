import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useOptions } from "@/hooks/use-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  computedQuantity: string;
  contaminationAlert: boolean;
  hadContamination: boolean;
  voided: boolean;
}

interface StageOption {
  id: number;
  label: string;
}

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

export default function SamplesList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [hideArchived, setHideArchived] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={hideArchived} onCheckedChange={(v) => setHideArchived(!!v)} id="hide-archived" />
            <Label htmlFor="hide-archived" className="text-sm cursor-pointer">
              Hide archived
            </Label>
          </label>
          <span className="text-xs text-muted-foreground ml-auto">
            {rows.length} sample{rows.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

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
    </div>
  );
}
