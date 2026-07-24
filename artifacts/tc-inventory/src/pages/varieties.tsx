import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useOptions } from "@/hooks/use-options";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, PackageX, AlarmClockOff, Sprout } from "lucide-react";

interface StageOption {
  id: number;
  label: string;
}

interface SampleSummary {
  id: number;
  sampleCode: string;
  stageTotals: Record<string, number>;
}

interface StrainSummary {
  id: number;
  label: string;
  stageTotals: Record<string, number>;
  minStorageStock: number;
  belowMinimumStock: boolean;
  oldestStorageTransferDate: string | null;
  storageAgeDays: number | null;
  isOverdueForRenewal: boolean;
  samples: SampleSummary[];
}

interface VarietySummary {
  id: number;
  label: string;
  stageTotals: Record<string, number>;
  strains: StrainSummary[];
}

function VesselCount({ quantity }: { quantity: number }) {
  return quantity > 0 ? (
    <span className="tabular-nums font-semibold text-sm">{quantity}</span>
  ) : (
    <span className="text-muted-foreground/40 text-sm">—</span>
  );
}

function BelowMinimumMark({ minStock }: { minStock: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PackageX className="h-3.5 w-3.5 text-destructive shrink-0" data-testid="mark-below-minimum" />
      </TooltipTrigger>
      <TooltipContent>Storage stock is below the minimum of {minStock}.</TooltipContent>
    </Tooltip>
  );
}

function OverdueRenewalMark({ ageDays }: { ageDays: number | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AlarmClockOff className="h-3.5 w-3.5 text-destructive shrink-0" data-testid="mark-overdue-renewal" />
      </TooltipTrigger>
      <TooltipContent>Oldest storage batch is {ageDays} days old — past the renewal interval.</TooltipContent>
    </Tooltip>
  );
}

export default function Varieties() {
  const [, navigate] = useLocation();
  const [expandedVarieties, setExpandedVarieties] = useState<Set<number>>(new Set());
  const [expandedStrains, setExpandedStrains] = useState<Set<number>>(new Set());

  const { data: varieties, isLoading } = useQuery({
    queryKey: ["varieties-summary"],
    queryFn: () => apiFetch<VarietySummary[]>("/api/varieties/summary"),
  });
  const { data: stageOptions } = useOptions("stage");
  const stages = useMemo(() => (stageOptions ?? []).map((s: StageOption) => s.label), [stageOptions]);

  function toggleVariety(id: number) {
    setExpandedVarieties((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleStrain(id: number) {
    setExpandedStrains((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Varieties</h1>
        <p className="text-muted-foreground mt-1">Inventory aggregated above sample level, for long-term maintenance.</p>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !varieties || varieties.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No varieties yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variety</TableHead>
                {stages.map((stage) => (
                  <TableHead key={stage} className="text-center capitalize whitespace-nowrap">
                    {stage}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {varieties.map((variety) => {
                // A variety with exactly one strain collapses straight through
                // to that strain's samples — no separate strain row for it,
                // since there's nothing a second row would distinguish. Its
                // warning marks show directly on the variety row instead.
                const singleStrain = variety.strains.length === 1 ? variety.strains[0] : null;
                const multiStrain = variety.strains.length > 1;
                const isExpanded = expandedVarieties.has(variety.id);
                const canExpand = variety.strains.length > 0;

                const rows: React.ReactNode[] = [
                  <TableRow
                    key={`variety-${variety.id}`}
                    className={`hover:bg-muted/50 ${isExpanded ? "bg-muted/20" : ""} ${canExpand ? "cursor-pointer" : ""}`}
                    onClick={() => canExpand && toggleVariety(variety.id)}
                    data-testid={`variety-row-${variety.label}`}
                  >
                    <TableCell className="font-semibold text-sm whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {canExpand && (
                          <ChevronRight
                            className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          />
                        )}
                        <Sprout className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {variety.label}
                        {singleStrain?.belowMinimumStock && <BelowMinimumMark minStock={singleStrain.minStorageStock} />}
                        {singleStrain?.isOverdueForRenewal && <OverdueRenewalMark ageDays={singleStrain.storageAgeDays} />}
                      </span>
                    </TableCell>
                    {stages.map((stage) => (
                      <TableCell key={stage} className="text-center">
                        <VesselCount quantity={variety.stageTotals[stage] ?? 0} />
                      </TableCell>
                    ))}
                  </TableRow>,
                ];

                if (isExpanded && singleStrain) {
                  // Skip the strain level; go straight to that strain's samples.
                  rows.push(
                    ...singleStrain.samples.map((sample) => (
                      <TableRow
                        key={`sample-${sample.id}`}
                        className="cursor-pointer hover:bg-primary/5 bg-muted/10 border-l-2 border-l-primary/20"
                        onClick={() => navigate(`/samples/${sample.id}`)}
                        data-testid={`sample-row-${sample.sampleCode}`}
                      >
                        <TableCell className="pl-8 font-mono text-sm text-primary">{sample.sampleCode}</TableCell>
                        {stages.map((stage) => (
                          <TableCell key={stage} className="text-center">
                            <VesselCount quantity={sample.stageTotals[stage] ?? 0} />
                          </TableCell>
                        ))}
                      </TableRow>
                    )),
                  );
                } else if (isExpanded && multiStrain) {
                  for (const strain of variety.strains) {
                    const strainExpanded = expandedStrains.has(strain.id);
                    rows.push(
                      <TableRow
                        key={`strain-${strain.id}`}
                        className="cursor-pointer hover:bg-primary/5 bg-muted/10 border-l-2 border-l-primary/20"
                        onClick={() => toggleStrain(strain.id)}
                        data-testid={`strain-row-${variety.label}-${strain.label}`}
                      >
                        <TableCell className="pl-8 text-sm font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight
                              className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${strainExpanded ? "rotate-90" : ""}`}
                            />
                            {strain.label}
                            {strain.belowMinimumStock && <BelowMinimumMark minStock={strain.minStorageStock} />}
                            {strain.isOverdueForRenewal && <OverdueRenewalMark ageDays={strain.storageAgeDays} />}
                          </span>
                        </TableCell>
                        {stages.map((stage) => (
                          <TableCell key={stage} className="text-center">
                            <VesselCount quantity={strain.stageTotals[stage] ?? 0} />
                          </TableCell>
                        ))}
                      </TableRow>,
                    );
                    if (strainExpanded) {
                      rows.push(
                        ...strain.samples.map((sample) => (
                          <TableRow
                            key={`sample-${sample.id}`}
                            className="cursor-pointer hover:bg-primary/5 bg-muted/20 border-l-2 border-l-primary/20"
                            onClick={() => navigate(`/samples/${sample.id}`)}
                            data-testid={`sample-row-${sample.sampleCode}`}
                          >
                            <TableCell className="pl-14 font-mono text-sm text-primary">{sample.sampleCode}</TableCell>
                            {stages.map((stage) => (
                              <TableCell key={stage} className="text-center">
                                <VesselCount quantity={sample.stageTotals[stage] ?? 0} />
                              </TableCell>
                            ))}
                          </TableRow>
                        )),
                      );
                    }
                  }
                }

                return rows;
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
