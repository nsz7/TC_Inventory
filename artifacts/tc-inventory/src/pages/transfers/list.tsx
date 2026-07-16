import { useListTransfers, getListTransfersQueryKey } from "@workspace/api-client-react";
import { parseLocalDate } from "@/lib/dates";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Plus } from "lucide-react";
import { format } from "date-fns";

export default function TransfersList() {
  const { data: transfers, isLoading } = useListTransfers(
    {},
    { query: { queryKey: getListTransfersQueryKey({}) } },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transfers</h1>
          <p className="text-muted-foreground mt-1">All subculture and transfer records</p>
        </div>
        <Link href="/transfers/new">
          <Button data-testid="button-new-transfer">
            <Plus className="mr-2 h-4 w-4" />Record Transfer
          </Button>
        </Link>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>From Sample</TableHead>
              <TableHead></TableHead>
              <TableHead>To Sample</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Technician</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Media</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : transfers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  No transfers recorded yet.{" "}
                  <Link href="/transfers/new">
                    <span className="text-primary hover:underline cursor-pointer">Record the first one.</span>
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              transfers?.map((t) => (
                <TableRow key={t.id} data-testid={`transfer-row-${t.id}`}>
                  <TableCell>
                    {t.fromSampleId ? (
                      <Link href={`/samples/${t.fromSampleId}`}>
                        <span className="font-mono text-sm text-primary hover:underline cursor-pointer">
                          {t.fromSampleCode ?? `#${t.fromSampleId}`}
                        </span>
                      </Link>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    {t.toSampleId ? (
                      <Link href={`/samples/${t.toSampleId}`}>
                        <span className="font-mono text-sm text-primary hover:underline cursor-pointer">
                          {t.toSampleCode ?? `#${t.toSampleId}`}
                        </span>
                      </Link>
                    ) : <span className="text-muted-foreground text-sm">External</span>}
                  </TableCell>
                  <TableCell className="text-sm">{format(parseLocalDate(t.transferDate), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-sm">{t.technician}</TableCell>
                  <TableCell className="text-right font-medium text-sm">{t.quantityTransferred}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.mediaType ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.fromLocation && t.toLocation ? `${t.fromLocation} → ${t.toLocation}` : t.fromLocation ?? t.toLocation ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
