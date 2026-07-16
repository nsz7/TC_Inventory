import {
  useListSamples,
  useUpdateSample,
  getListSamplesQueryKey,
  useDiscardContaminated,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import type { ListSamplesQueryResult } from "@workspace/api-client-react";
import { parseLocalDate } from "@/lib/dates";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { format, isPast, differenceInDays } from "date-fns";
import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  Clock,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Printer,
  ChevronRight,
  Rows3,
  List,
  FileUp,
  TableProperties,
  Save,
  X,
} from "lucide-react";
import { ImportSamplesDialog } from "@/components/import-samples-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type Sample = NonNullable<ListSamplesQueryResult>[number];
type ViewMode = "compact" | "long" | "bulk";
type SortKey = "rootCode" | "cultivar" | "stage" | "quantity" | "location" | "containerType" | "status" | "nextActionDate";
type SortDir = "asc" | "desc";

interface EditDraft {
  quantity: number;
  status: string;
  nextAction: string;
  nextActionDate: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract root code and sub-code from a sample code.
 * Sub-code = trailing segment starting with a letter then optional digits.
 *   TC-2024-001-S1  → root="TC-2024-001", sub="S1"
 *   FA26_001-m1     → root="FA26_001",    sub="m1"
 *   FA26_001        → root="FA26_001",    sub=""
 */
function extractCodeParts(sampleCode: string): { rootCode: string; subCode: string } {
  const match = sampleCode.match(/^(.+?)[-_]([a-zA-Z]\d*)$/);
  if (match) return { rootCode: match[1], subCode: match[2] };
  return { rootCode: sampleCode, subCode: "" };
}

/** Simplified stage labels */
const STAGE_LABEL: Record<string, string> = {
  initiation: "Introduction",
  multiplication: "Multiplication",
  rooting: "Revitalization",
  acclimatization: "Revitalization",
  "long-term storage": "Storage",
};

function stageLabel(stage: string) {
  return STAGE_LABEL[stage.toLowerCase()] ?? stage;
}

function getStatusColor(status: string) {
  switch (status) {
    case "active": return "bg-green-100 text-green-800";
    case "contaminated": return "bg-red-100 text-red-800";
    case "discarded": return "bg-gray-100 text-gray-800";
    case "archived": return "bg-blue-100 text-blue-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

function getStageColor(stage: string) {
  const s = stage.toLowerCase();
  if (s === "initiation") return "bg-purple-100 text-purple-800";
  if (s === "multiplication") return "bg-teal-100 text-teal-800";
  if (s === "rooting") return "bg-amber-100 text-amber-800";
  if (s === "acclimatization") return "bg-emerald-100 text-emerald-800";
  if (s === "long-term storage") return "bg-sky-100 text-sky-800";
  return "bg-gray-100 text-gray-800";
}

/** Priority order for dominant status in a group */
const STATUS_PRIORITY: Record<string, number> = {
  contaminated: 4, active: 3, archived: 2, discarded: 1,
};

function dominantStatus(samples: Sample[]) {
  return samples.reduce((best, s) =>
    (STATUS_PRIORITY[s.status] ?? 0) > (STATUS_PRIORITY[best] ?? 0) ? s.status : best,
    samples[0]?.status ?? "active"
  );
}

function NextActionCell({ date, action }: { date: string | null; action: string | null }) {
  if (!date) return <span className="text-muted-foreground text-xs">—</span>;
  const d = parseLocalDate(date);
  const overdue = isPast(d);
  const daysLeft = differenceInDays(d, new Date());
  const soon = daysLeft >= 0 && daysLeft <= 7;
  return (
    <div className="space-y-0.5">
      <div className={`flex items-center gap-1 text-xs font-medium ${overdue ? "text-red-600" : soon ? "text-amber-600" : "text-muted-foreground"}`}>
        {overdue ? <AlertTriangle className="h-3 w-3" /> : soon ? <Clock className="h-3 w-3" /> : null}
        {format(d, "MMM d")}
        {overdue && <span className="text-red-500 font-semibold">(overdue)</span>}
        {soon && !overdue && <span className="text-amber-500">({daysLeft}d)</span>}
      </div>
      {action && <div className="text-xs text-muted-foreground truncate max-w-[140px]" title={action}>{action}</div>}
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
}

// ── group structure ───────────────────────────────────────────────────────────

interface SampleGroup {
  rootCode: string;
  cultivar: string;
  batches: Sample[];          // visible batches after filtering
}

function buildGroups(
  allSamples: Sample[],
  search: string,
  stageFilter: string,
  hideArchived: boolean,
  hideDiscarded: boolean,
  hideZeroVessels: boolean,
): SampleGroup[] {
  const q = search.toLowerCase();

  const visible = allSamples.filter((s) => {
    if (hideArchived && s.status === "archived") return false;
    if (hideDiscarded && s.status === "discarded") return false;
    if (hideZeroVessels && s.quantity <= 0) return false;
    if (stageFilter !== "all") {
      // match by original stage or simplified label
      const simplified = stageLabel(s.stage).toLowerCase();
      const filter = stageFilter.toLowerCase();
      if (s.stage.toLowerCase() !== filter && simplified !== filter) return false;
    }
    if (q) {
      return (
        s.sampleCode.toLowerCase().includes(q) ||
        s.cultivar.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        (s.containerType ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const map = new Map<string, SampleGroup>();
  for (const s of visible) {
    const { rootCode } = extractCodeParts(s.sampleCode);
    if (!map.has(rootCode)) {
      map.set(rootCode, { rootCode, cultivar: s.cultivar, batches: [] });
    }
    map.get(rootCode)!.batches.push(s);
  }

  return Array.from(map.values()).sort((a, b) => a.rootCode.localeCompare(b.rootCode));
}

// ── main component ────────────────────────────────────────────────────────────

export default function SamplesList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("rootCode");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [importOpen, setImportOpen] = useState(false);
  // hide-filters
  const [hideArchived, setHideArchived] = useState(true);
  const [hideDiscarded, setHideDiscarded] = useState(true);
  const [hideZeroVessels, setHideZeroVessels] = useState(true);
  // bulk edit state
  const [edits, setEdits] = useState<Record<number, EditDraft>>({});
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const discardContaminated = useDiscardContaminated();
  const updateSample = useUpdateSample();

  const { data: allSamples, isLoading } = useListSamples(
    {},
    { query: { queryKey: getListSamplesQueryKey() } },
  );

  const contaminatedCount = allSamples?.filter((s) => s.status === "contaminated").length ?? 0;

  function toggleExpand(rootCode: string) {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      next.has(rootCode) ? next.delete(rootCode) : next.add(rootCode);
      return next;
    });
  }

  // ── bulk-edit helpers ──────────────────────────────────────────────────────

  function draftFor(s: Sample): EditDraft {
    return {
      quantity: s.quantity,
      status: s.status,
      nextAction: s.nextAction ?? "",
      nextActionDate: s.nextActionDate ?? "",
    };
  }

  function updateEdit(id: number, field: keyof EditDraft, value: string | number, original: Sample) {
    setEdits((prev) => {
      const base = prev[id] ?? draftFor(original);
      const updated = { ...base, [field]: value };
      // remove from edits if all fields match original
      const orig = draftFor(original);
      const isClean =
        updated.quantity === orig.quantity &&
        updated.status === orig.status &&
        updated.nextAction === orig.nextAction &&
        updated.nextActionDate === orig.nextActionDate;
      if (isClean) {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: updated };
    });
  }

  async function saveBulkEdits() {
    const ids = Object.keys(edits).map(Number);
    if (ids.length === 0) return;
    setIsSaving(true);
    try {
      for (const id of ids) {
        const d = edits[id];
        await updateSample.mutateAsync({
          id,
          data: {
            quantity: d.quantity,
            status: d.status,
            nextAction: d.nextAction || undefined,
            nextActionDate: d.nextActionDate || undefined,
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      setEdits({});
      toast({ title: "Changes saved", description: `${ids.length} sample${ids.length !== 1 ? "s" : ""} updated.` });
    } catch {
      toast({ title: "Save failed", description: "Some changes could not be saved.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  function cancelBulkEdits() {
    setEdits({});
  }

  function handleSort(col: SortKey) {
    if (col === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("asc"); }
  }

  function handleDiscardContaminated() {
    discardContaminated.mutate(undefined, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Contaminated samples discarded", description: `${result.discarded} sample${result.discarded !== 1 ? "s" : ""} marked as discarded.` });
      },
      onError: () => toast({ title: "Error", description: "Failed to discard samples.", variant: "destructive" }),
    });
  }

  // ── data ──────────────────────────────────────────────────────────────────

  const groups = useMemo(() =>
    buildGroups(allSamples ?? [], search, stageFilter, hideArchived, hideDiscarded, hideZeroVessels),
    [allSamples, search, stageFilter, hideArchived, hideDiscarded, hideZeroVessels]
  );

  // Flat list for long mode: all batches across all groups, sorted
  const flatRows = useMemo(() => {
    const all = groups.flatMap((g) => g.batches);
    return [...all].sort((a, b) => {
      const { rootCode: ar, subCode: as_ } = extractCodeParts(a.sampleCode);
      const { rootCode: br, subCode: bs } = extractCodeParts(b.sampleCode);

      if (sortKey === "rootCode") {
        const rc = ar.localeCompare(br);
        return rc !== 0 ? (sortDir === "asc" ? rc : -rc) : as_.localeCompare(bs);
      }

      let av: string | number;
      let bv: string | number;
      if (sortKey === "quantity") { av = a.quantity; bv = b.quantity; }
      else if (sortKey === "nextActionDate") { av = a.nextActionDate ?? "9999"; bv = b.nextActionDate ?? "9999"; }
      else if (sortKey === "containerType") { av = a.containerType ?? ""; bv = b.containerType ?? ""; }
      else if (sortKey === "stage") { av = stageLabel(a.stage); bv = stageLabel(b.stage); }
      else { av = (a[sortKey as keyof Sample] as string) ?? ""; bv = (b[sortKey as keyof Sample] as string) ?? ""; }

      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [groups, sortKey, sortDir]);

  // ── column header ─────────────────────────────────────────────────────────

  function ColHead({ col, label, className = "" }: { col: SortKey; label: string; className?: string }) {
    return (
      <TableHead className={`cursor-pointer select-none whitespace-nowrap ${className}`} onClick={() => handleSort(col)}>
        <span className="flex items-center">{label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} /></span>
      </TableHead>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const editCount = Object.keys(edits).length;
  const totalVisible = viewMode === "compact" ? groups.length : flatRows.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Samples</h1>
          <p className="text-muted-foreground mt-1">Manage your tissue culture inventory</p>
        </div>
        <div className="flex gap-2 flex-wrap print:hidden">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />Print / Export
          </Button>
          {contaminatedCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="button-discard-contaminated">
                  <Trash2 className="mr-2 h-4 w-4" />Discard Contaminated ({contaminatedCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard all contaminated samples?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark {contaminatedCount} contaminated sample{contaminatedCount !== 1 ? "s" : ""} as{" "}
                    <strong>discarded</strong>. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDiscardContaminated} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Discard {contaminatedCount} sample{contaminatedCount !== 1 ? "s" : ""}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Link href="/samples/new">
            <Button data-testid="button-new-sample"><Plus className="mr-2 h-4 w-4" />New Sample</Button>
          </Link>
        </div>
      </div>

      {/* Controls bar */}
      <div className="space-y-3 bg-card p-4 rounded-lg border print:hidden">
        {/* Search + stage + view toggle */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by code, cultivar, location…" className="pl-9" value={search}
              onChange={(e) => setSearch(e.target.value)} data-testid="input-search" />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[170px]" data-testid="select-stage-filter">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="initiation">Introduction</SelectItem>
              <SelectItem value="multiplication">Multiplication</SelectItem>
              <SelectItem value="rooting">Revitalization</SelectItem>
              <SelectItem value="long-term storage">Storage</SelectItem>
            </SelectContent>
          </Select>
          {/* View mode toggle */}
          <div className="flex rounded-md border overflow-hidden shrink-0">
            <button
              onClick={() => { setViewMode("compact"); cancelBulkEdits(); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${viewMode === "compact" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            >
              <Rows3 className="h-4 w-4" />Compact
            </button>
            <button
              onClick={() => { setViewMode("long"); setExpandedRoots(new Set()); cancelBulkEdits(); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-l transition-colors ${viewMode === "long" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            >
              <List className="h-4 w-4" />Detail
            </button>
            <button
              onClick={() => { setViewMode("bulk"); setExpandedRoots(new Set()); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-l transition-colors ${viewMode === "bulk" ? "bg-amber-600 text-white" : "hover:bg-muted text-muted-foreground"}`}
            >
              <TableProperties className="h-4 w-4" />Edit
            </button>
          </div>
        </div>

        {/* Hide-filter checkboxes */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hide:</span>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={hideArchived} onCheckedChange={(v) => setHideArchived(!!v)} id="hide-archived" />
            <Label htmlFor="hide-archived" className="text-sm cursor-pointer">Archived</Label>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={hideDiscarded} onCheckedChange={(v) => setHideDiscarded(!!v)} id="hide-discarded" />
            <Label htmlFor="hide-discarded" className="text-sm cursor-pointer">Discarded</Label>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={hideZeroVessels} onCheckedChange={(v) => setHideZeroVessels(!!v)} id="hide-zero" />
            <Label htmlFor="hide-zero" className="text-sm cursor-pointer">Zero vessels</Label>
          </label>
          <span className="text-xs text-muted-foreground ml-auto">{totalVisible} row{totalVisible !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h2 className="text-xl font-bold">TC Inventory Lab Report</h2>
        <p className="text-sm text-gray-600">Generated: {format(new Date(), "MMMM d, yyyy")}</p>
        <p className="text-sm text-gray-600">View: {viewMode} · Total rows: {totalVisible}</p>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading samples…</div>
        ) : totalVisible === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No samples match the current filters.</div>
        ) : viewMode === "compact" ? (
          /* ── COMPACT TABLE — Code · Cultivar · i · m · r · s · Status · Next Action ── */
          <Table>
            <TableHeader>
              <TableRow>
                <ColHead col="rootCode" label="Code" />
                <ColHead col="cultivar" label="Cultivar" />
                {/* Stage pivot columns */}
                <TableHead className="text-center w-16 whitespace-nowrap">
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold text-purple-700">i</span>
                    <span className="text-[10px] font-normal text-muted-foreground leading-none">Intro</span>
                  </span>
                </TableHead>
                <TableHead className="text-center w-16 whitespace-nowrap">
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold text-teal-700">m</span>
                    <span className="text-[10px] font-normal text-muted-foreground leading-none">Mult</span>
                  </span>
                </TableHead>
                <TableHead className="text-center w-16 whitespace-nowrap">
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold text-amber-700">r</span>
                    <span className="text-[10px] font-normal text-muted-foreground leading-none">Revit</span>
                  </span>
                </TableHead>
                <TableHead className="text-center w-16 whitespace-nowrap">
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold text-sky-700">s</span>
                    <span className="text-[10px] font-normal text-muted-foreground leading-none">Storage</span>
                  </span>
                </TableHead>
                <TableHead className="text-center w-16 whitespace-nowrap">
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold text-rose-700">+</span>
                    <span className="text-[10px] font-normal text-muted-foreground leading-none">Other</span>
                  </span>
                </TableHead>
                <ColHead col="status" label="Status" />
                <ColHead col="nextActionDate" label="Next Action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const isExpanded = expandedRoots.has(group.rootCode);
                const multiRow = group.batches.length > 1;

                // Vessel counts per stage category
                const KNOWN_STAGES = ["initiation","multiplication","rooting","acclimatization","revitalization","long-term storage"];
                const iVessels = group.batches.filter(b => ["initiation"].includes(b.stage)).reduce((s,b) => s + b.quantity, 0);
                const mVessels = group.batches.filter(b => ["multiplication"].includes(b.stage)).reduce((s,b) => s + b.quantity, 0);
                const rVessels = group.batches.filter(b => ["rooting","acclimatization","revitalization"].includes(b.stage)).reduce((s,b) => s + b.quantity, 0);
                const sVessels = group.batches.filter(b => ["long-term storage"].includes(b.stage)).reduce((s,b) => s + b.quantity, 0);
                const otherVessels = group.batches.filter(b => !KNOWN_STAGES.includes(b.stage)).reduce((s,b) => s + b.quantity, 0);

                const status = dominantStatus(group.batches);
                const earliestAction = group.batches
                  .filter((b) => b.nextActionDate)
                  .sort((a, b) => (a.nextActionDate! < b.nextActionDate! ? -1 : 1))[0];

                function VesselCount({ n, color }: { n: number; color: string }) {
                  return n > 0
                    ? <span className={`tabular-nums font-semibold text-sm ${color}`}>{n}</span>
                    : <span className="text-muted-foreground/40 text-sm">—</span>;
                }

                return [
                  /* ── Compact summary row ── */
                  <TableRow
                    key={`${group.rootCode}-compact`}
                    className={`hover:bg-muted/50 ${isExpanded ? "bg-muted/20" : ""} ${multiRow ? "cursor-pointer" : "cursor-default"}`}
                    onClick={() => multiRow && toggleExpand(group.rootCode)}
                    data-testid={`sample-row-${group.rootCode}`}
                  >
                    {/* Code — expand icon built in */}
                    <TableCell
                      className="font-mono font-bold text-primary text-sm whitespace-nowrap"
                      onClick={(e) => {
                        if (!multiRow) { e.stopPropagation(); navigate(`/samples/${group.batches[0]!.id}`); }
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {multiRow && (
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        )}
                        {group.rootCode}
                      </span>
                    </TableCell>

                    <TableCell className="text-sm">{group.cultivar || "—"}</TableCell>

                    {/* Stage vessel pivot cells */}
                    <TableCell className="text-center"><VesselCount n={iVessels} color="text-purple-700" /></TableCell>
                    <TableCell className="text-center"><VesselCount n={mVessels} color="text-teal-700" /></TableCell>
                    <TableCell className="text-center"><VesselCount n={rVessels} color="text-amber-700" /></TableCell>
                    <TableCell className="text-center"><VesselCount n={sVessels} color="text-sky-700" /></TableCell>
                    <TableCell className="text-center"><VesselCount n={otherVessels} color="text-rose-700" /></TableCell>

                    <TableCell>
                      <Badge variant="outline" className={`capitalize border-0 text-xs ${getStatusColor(status)}`}>
                        {status}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <NextActionCell
                        date={earliestAction?.nextActionDate ?? null}
                        action={earliestAction?.nextAction ?? null}
                      />
                    </TableCell>
                  </TableRow>,

                  /* ── Expanded sub-rows — same 8 columns ── */
                  ...(isExpanded
                    ? group.batches.map((batch) => {
                        const { subCode } = extractCodeParts(batch.sampleCode);
                        const bStage = batch.stage;
                        const biV = ["initiation"].includes(bStage) ? batch.quantity : 0;
                        const bmV = ["multiplication"].includes(bStage) ? batch.quantity : 0;
                        const brV = ["rooting","acclimatization","revitalization"].includes(bStage) ? batch.quantity : 0;
                        const bsV = ["long-term storage"].includes(bStage) ? batch.quantity : 0;
                        const boV = !["initiation","multiplication","rooting","acclimatization","revitalization","long-term storage"].includes(bStage) ? batch.quantity : 0;
                        return (
                          <TableRow
                            key={`${group.rootCode}-expanded-${batch.id}`}
                            className="cursor-pointer hover:bg-primary/5 bg-muted/10 border-l-2 border-l-primary/20"
                            onClick={() => navigate(`/samples/${batch.id}`)}
                          >
                            {/* Sub-code + location */}
                            <TableCell className="pl-8">
                              <div className="inline-flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-primary">{subCode || "—"}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{batch.location}</div>
                            </TableCell>

                            <TableCell className="text-sm">{batch.cultivar || "—"}</TableCell>

                            {/* Pivot vessel counts — only the matching stage has a number */}
                            <TableCell className="text-center"><VesselCount n={biV} color="text-purple-700" /></TableCell>
                            <TableCell className="text-center"><VesselCount n={bmV} color="text-teal-700" /></TableCell>
                            <TableCell className="text-center"><VesselCount n={brV} color="text-amber-700" /></TableCell>
                            <TableCell className="text-center"><VesselCount n={bsV} color="text-sky-700" /></TableCell>
                            <TableCell className="text-center"><VesselCount n={boV} color="text-rose-700" /></TableCell>

                            <TableCell>
                              <Badge variant="outline" className={`capitalize border-0 text-xs ${getStatusColor(batch.status)}`}>
                                {batch.status}
                              </Badge>
                            </TableCell>

                            <TableCell>
                              <NextActionCell
                                date={batch.nextActionDate ?? null}
                                action={batch.nextAction ?? null}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    : []),
                ];
              })}
            </TableBody>
          </Table>
        ) : viewMode === "long" ? (
          /* ── LONG / DETAIL TABLE ────────────────────────────────────────── */
          <Table>
            <TableHeader>
              <TableRow>
                <ColHead col="rootCode" label="Code" />
                <TableHead className="whitespace-nowrap">Sub-code</TableHead>
                <ColHead col="cultivar" label="Cultivar" />
                <ColHead col="stage" label="Stage" />
                <ColHead col="quantity" label="Vessels" />
                <ColHead col="location" label="Location" />
                <ColHead col="containerType" label="Container" />
                <ColHead col="status" label="Status" />
                <ColHead col="nextActionDate" label="Next Action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatRows.map((s) => {
                const { rootCode, subCode } = extractCodeParts(s.sampleCode);
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/50"
                    data-testid={`sample-row-${s.id}`}
                    onClick={() => navigate(`/samples/${s.id}`)}
                  >
                    <TableCell className="font-mono font-semibold text-primary text-sm whitespace-nowrap">
                      {rootCode}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-muted-foreground">
                      {subCode || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{s.cultivar || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize border-0 text-xs ${getStageColor(s.stage)}`}>
                        {stageLabel(s.stage)}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">{s.quantity}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.location}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.containerType ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize border-0 text-xs ${getStatusColor(s.status)}`}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <NextActionCell date={s.nextActionDate ?? null} action={s.nextAction ?? null} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          /* ── BULK EDIT / INLINE SPREADSHEET ─────────────────────────────── */
          <Table>
            <TableHeader>
              <TableRow className="bg-amber-50">
                <TableHead className="w-8 text-center text-amber-700 font-bold text-xs">#</TableHead>
                <ColHead col="rootCode" label="Code" />
                <ColHead col="cultivar" label="Cultivar" />
                <ColHead col="stage" label="Stage" />
                <TableHead className="w-24 text-amber-700">Vessels</TableHead>
                <TableHead className="w-36 text-amber-700">Status</TableHead>
                <TableHead className="w-36 text-amber-700">Next Date</TableHead>
                <TableHead className="text-amber-700">Next Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatRows.map((s, idx) => {
                const draft = edits[s.id];
                const isDirty = !!draft;
                const qty = draft?.quantity ?? s.quantity;
                const status = draft?.status ?? s.status;
                const nextAction = draft?.nextAction ?? s.nextAction ?? "";
                const nextActionDate = draft?.nextActionDate ?? s.nextActionDate ?? "";
                const { rootCode, subCode } = extractCodeParts(s.sampleCode);
                return (
                  <TableRow
                    key={s.id}
                    className={isDirty ? "bg-amber-50/60 border-l-2 border-l-amber-400" : "hover:bg-muted/30"}
                  >
                    {/* Row number */}
                    <TableCell className="text-center text-xs text-muted-foreground tabular-nums">{idx + 1}</TableCell>

                    {/* Code — read-only, click opens detail */}
                    <TableCell
                      className="font-mono text-sm text-primary whitespace-nowrap cursor-pointer hover:underline"
                      onClick={() => navigate(`/samples/${s.id}`)}
                    >
                      <span className="font-semibold">{rootCode}</span>
                      {subCode && <span className="text-muted-foreground font-normal">-{subCode}</span>}
                    </TableCell>

                    {/* Cultivar — read-only */}
                    <TableCell className="text-sm text-muted-foreground">{s.cultivar}</TableCell>

                    {/* Stage — read-only badge */}
                    <TableCell>
                      <Badge variant="outline" className={`capitalize border-0 text-xs ${getStageColor(s.stage)}`}>
                        {stageLabel(s.stage)}
                      </Badge>
                    </TableCell>

                    {/* Vessels — editable */}
                    <TableCell>
                      <input
                        type="number"
                        min={0}
                        value={qty}
                        onChange={(e) => updateEdit(s.id, "quantity", Number(e.target.value), s)}
                        className="w-20 h-8 rounded border border-input bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </TableCell>

                    {/* Status — editable select */}
                    <TableCell>
                      <select
                        value={status}
                        onChange={(e) => updateEdit(s.id, "status", e.target.value, s)}
                        className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 capitalize"
                      >
                        <option value="active">Active</option>
                        <option value="contaminated">Contaminated</option>
                        <option value="discarded">Discarded</option>
                        <option value="archived">Archived</option>
                      </select>
                    </TableCell>

                    {/* Next Action Date — editable */}
                    <TableCell>
                      <input
                        type="date"
                        value={nextActionDate}
                        onChange={(e) => updateEdit(s.id, "nextActionDate", e.target.value, s)}
                        className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </TableCell>

                    {/* Next Action — editable text */}
                    <TableCell>
                      <input
                        type="text"
                        value={nextAction}
                        placeholder="e.g. Subculture"
                        onChange={(e) => updateEdit(s.id, "nextAction", e.target.value, s)}
                        className="w-full min-w-[160px] h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Sticky save bar (bulk edit mode) ─────────────────────────────────── */}
      {viewMode === "bulk" && (
        <div className="sticky bottom-4 z-30 flex justify-center pointer-events-none">
          <div className={`pointer-events-auto flex items-center gap-3 rounded-xl border shadow-lg px-5 py-3 transition-all ${
            editCount > 0
              ? "bg-amber-600 text-white border-amber-700"
              : "bg-card border text-muted-foreground"
          }`}>
            {editCount > 0 ? (
              <>
                <span className="text-sm font-semibold">{editCount} unsaved change{editCount !== 1 ? "s" : ""}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-white text-amber-700 hover:bg-amber-50 h-8"
                  onClick={saveBulkEdits}
                  disabled={isSaving}
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSaving ? "Saving…" : "Save all"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-amber-700 h-8"
                  onClick={cancelBulkEdits}
                  disabled={isSaving}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />Discard
                </Button>
              </>
            ) : (
              <span className="text-sm">Edit mode — change any cell to record updates</span>
            )}
          </div>
        </div>
      )}

      {/* Print footer */}
      <div className="hidden print:block mt-6 pt-4 border-t text-xs text-gray-500">
        <p>TC Inventory — {window.location.hostname}</p>
      </div>

      <ImportSamplesDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        }}
      />
    </div>
  );
}
