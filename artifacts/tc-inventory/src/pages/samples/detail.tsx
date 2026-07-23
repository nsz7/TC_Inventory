import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { parseLocalDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Pencil, AlertTriangle, History } from "lucide-react";

interface Sample {
  id: number;
  sampleCode: string;
  varietyLabel: string | null;
  strainLabel: string | null;
  archived: boolean;
  archivedReason: string | null;
  voided: boolean;
  voidedReason: string | null;
  hadContaminationRollup: boolean;
}

interface Batch {
  id: number;
  subcode: string;
  stage: string;
  transferDate: string;
  location: string;
  computedQuantity: string;
  contaminationAlert: boolean;
  hadContamination: boolean;
  voided: boolean;
}

/** Sample-level overview: identity plus every batch under it, each linking
 * to batch detail — where the actual daily-workflow actions (transfer,
 * discard, history) live. */
export default function SampleDetail() {
  const params = useParams();
  const sampleId = Number(params.id);

  const { data: sample, isLoading: sampleLoading } = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => apiFetch<Sample>(`/api/samples/${sampleId}`),
  });
  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ["sample-batches", sampleId],
    queryFn: () => apiFetch<Batch[]>(`/api/samples/${sampleId}/batches`),
  });

  if (sampleLoading || batchesLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!sample) return <p className="text-muted-foreground p-8">Sample not found.</p>;

  const visibleBatches = (batches ?? []).filter((b) => !b.voided);

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/samples">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Samples
        </Button>
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono flex items-center gap-2">
            {sample.sampleCode}
            {sample.hadContaminationRollup && (
              <Badge variant="outline" className="gap-1 text-muted-foreground text-xs">
                <History className="h-3 w-3" />
                Had contamination
              </Badge>
            )}
            {sample.archived && <Badge variant="secondary">Archived</Badge>}
            {sample.voided && <Badge variant="secondary">Voided</Badge>}
          </h1>
          <p className="text-muted-foreground mt-1">
            {sample.varietyLabel ?? "—"}
            {sample.strainLabel && <> · {sample.strainLabel}</>}
          </p>
        </div>
        <Link href={`/samples/${sample.id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Edit variety/strain
          </Button>
        </Link>
      </div>

      {sample.archived && sample.archivedReason && (
        <p className="text-sm text-muted-foreground">Archived: {sample.archivedReason}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batches</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No batches.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subcode</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Transfer date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Rows arrive pre-sorted by transfer date from the API, not
                    by subcode — see the comment on that ordering in
                    routes/samples.ts. The date is shown here so that order
                    is legible rather than looking like a display bug. */}
                {visibleBatches.map((batch) => (
                  <TableRow key={batch.id} className="cursor-pointer hover:bg-muted/50" data-testid={`batch-row-${batch.subcode}`}>
                    <TableCell>
                      <Link href={`/batches/${batch.id}`} className="font-mono font-semibold text-primary hover:underline">
                        {batch.subcode}
                      </Link>
                      {batch.contaminationAlert && <AlertTriangle className="inline h-3.5 w-3.5 text-destructive ml-1.5" />}
                      {batch.hadContamination && <History className="inline h-3.5 w-3.5 text-muted-foreground ml-1.5" />}
                    </TableCell>
                    <TableCell className="capitalize text-sm">{batch.stage}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(parseLocalDate(batch.transferDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{batch.location}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{batch.computedQuantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
