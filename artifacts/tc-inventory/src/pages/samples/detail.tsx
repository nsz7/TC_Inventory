import { useState } from "react";
import { parseLocalDate } from "@/lib/dates";
import { useParams, useLocation, Link } from "wouter";
import {
  useGetSample,
  getGetSampleQueryKey,
  useGetSampleTransfers,
  getGetSampleTransfersQueryKey,
  useDeleteSample,
  useListSamples,
  getListSamplesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Edit, Trash2, ArrowRight, GitBranch, Minus } from "lucide-react";
import { format } from "date-fns";
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
import { useToast } from "@/hooks/use-toast";
import { SubcultureDialog } from "@/components/subculture-dialog";
import { RemoveVesselsDialog } from "@/components/remove-vessels-dialog";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  contaminated: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  discarded: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  archived: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
};

const stageColors: Record<string, string> = {
  initiation: "bg-purple-100 text-purple-800",
  multiplication: "bg-teal-100 text-teal-800",
  rooting: "bg-amber-100 text-amber-800",
  acclimatization: "bg-emerald-100 text-emerald-800",
  "long-term storage": "bg-sky-100 text-sky-800",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-3 border-b border-border last:border-0">
      <span className="text-sm font-medium text-muted-foreground sm:w-40 shrink-0">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export default function SampleDetail() {
  const { id } = useParams<{ id: string }>();
  const sampleId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteSample = useDeleteSample();
  const [subcultureOpen, setSubcultureOpen] = useState(false);
  const [removeVesselsOpen, setRemoveVesselsOpen] = useState(false);

  const { data: sample, isLoading } = useGetSample(sampleId, {
    query: { enabled: !!sampleId, queryKey: getGetSampleQueryKey(sampleId) },
  });

  const { data: transfers, isLoading: transfersLoading } = useGetSampleTransfers(sampleId, {
    query: { enabled: !!sampleId, queryKey: getGetSampleTransfersQueryKey(sampleId) },
  });

  const { data: children } = useListSamples(
    { parentSampleId: sampleId },
    { query: { enabled: !!sampleId, queryKey: [...getListSamplesQueryKey(), "children", sampleId] } },
  );

  const { data: parentSample } = useGetSample(sample?.parentSampleId ?? 0, {
    query: {
      enabled: !!sample?.parentSampleId,
      queryKey: getGetSampleQueryKey(sample?.parentSampleId ?? 0),
    },
  });

  function handleDelete() {
    deleteSample.mutate(
      { id: sampleId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
          toast({ title: "Sample deleted", description: "The sample has been removed." });
          setLocation("/samples");
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to delete sample.", variant: "destructive" });
        },
      },
    );
  }


  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!sample) {
    return (
      <div className="space-y-4">
        <Link href="/samples">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        </Link>
        <p className="text-muted-foreground">Sample not found.</p>
      </div>
    );
  }

  const isArchived = sample.status === "archived";
  const removeTubeLabel = sample.quantity <= 1
    ? "Remove last vessel (deletes record)"
    : `Remove 1 contaminated vessel (${sample.quantity} → ${sample.quantity - 1})`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/samples">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />Back to Samples
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight" data-testid="text-sample-code">
            {sample.sampleCode}
          </h1>
          <p className="text-muted-foreground mt-1 italic">{sample.cultivar}</p>
          {parentSample && (
            <p className="text-sm text-muted-foreground mt-1">
              Derived from{" "}
              <Link href={`/samples/${parentSample.id}`}>
                <span className="font-mono text-primary hover:underline cursor-pointer">{parentSample.sampleCode}</span>
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/samples/${sampleId}/edit`}>
            <Button variant="outline" size="sm" data-testid="button-edit">
              <Edit className="h-4 w-4 mr-2" />Edit
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSubcultureOpen(true)}
            data-testid="button-subculture"
          >
            <GitBranch className="h-4 w-4 mr-2" />Subculture
          </Button>
          <Link href={`/transfers/new?fromSampleId=${sampleId}`}>
            <Button variant="secondary" size="sm" data-testid="button-record-transfer">
              <ArrowRight className="h-4 w-4 mr-2" />Record Transfer
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="text-amber-600 border-amber-300 hover:bg-amber-50"
            onClick={() => setRemoveVesselsOpen(true)}
            data-testid="button-remove-vessel"
          >
            <Minus className="h-4 w-4 mr-2" />Remove Vessels
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" data-testid="button-delete">
                <Trash2 className="h-4 w-4 mr-2" />Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Sample?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete {sample.sampleCode}. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sample Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow
              label="Status"
              value={
                <Badge variant="outline" className={`capitalize border-0 ${statusColors[sample.status] ?? ""}`}>
                  {sample.status}
                </Badge>
              }
            />
            <DetailRow
              label="Stage"
              value={
                <Badge variant="outline" className={`capitalize border-0 ${stageColors[sample.stage] ?? "bg-gray-100 text-gray-800"}`}>
                  {sample.stage}
                </Badge>
              }
            />
            <DetailRow label="Cultivar" value={sample.cultivar} />
            <DetailRow label="Media Type" value={sample.mediaType} />
            <DetailRow label="Container Type" value={sample.containerType} />
            <DetailRow label="Quantity" value={`${sample.quantity} vessel${sample.quantity !== 1 ? "s" : ""}`} />
            <DetailRow label="Location" value={sample.location} />
            <DetailRow label="Date Initiated" value={format(parseLocalDate(sample.dateInitiated), "MMMM d, yyyy")} />
            {sample.notes && (
              <div className="py-3">
                <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{sample.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Transfers</p>
                <p className="text-2xl font-bold">{transfers?.length ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="text-sm font-medium">{format(new Date(sample.createdAt), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="text-sm font-medium">{sample.updatedAt ? format(new Date(sample.updatedAt), "MMM d, yyyy") : "—"}</p>
              </div>
            </CardContent>
          </Card>

          {children && children.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitBranch className="h-4 w-4 text-primary" />
                  Subculture Lineage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {children.map((child) => (
                  <Link key={child.id} href={`/samples/${child.id}`}>
                    <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer border">
                      <div>
                        <p className="font-mono text-sm font-medium text-primary">{child.sampleCode}</p>
                        <p className="text-xs text-muted-foreground capitalize">{child.stage} · {child.quantity} vessel{child.quantity !== 1 ? "s" : ""}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`capitalize border-0 text-xs ${statusColors[child.status] ?? ""}`}
                      >
                        {child.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer History</CardTitle>
        </CardHeader>
        <CardContent>
          {transfersLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : transfers?.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No transfers recorded for this sample.</p>
          ) : (
            <div className="space-y-3">
              {transfers?.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-4 border rounded-md" data-testid={`transfer-row-${t.id}`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{t.fromSampleCode ?? `#${t.fromSampleId}`}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm font-medium">{t.toSampleCode ?? (t.toSampleId ? `#${t.toSampleId}` : "External")}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t.technician} • {format(parseLocalDate(t.transferDate), "MMM d, yyyy")}
                      {t.fromLocation && t.toLocation && ` • ${t.fromLocation} → ${t.toLocation}`}
                    </p>
                    {t.notes && <p className="text-xs text-muted-foreground italic">{t.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium">Qty: {t.quantityTransferred}</div>
                    {t.mediaType && <div className="text-xs text-muted-foreground">{t.mediaType}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SubcultureDialog
        sampleId={sampleId}
        sampleCode={sample.sampleCode}
        parentStage={sample.stage}
        parentContainer={sample.containerType ?? ""}
        parentLocation={sample.location}
        parentMedia={sample.mediaType ?? ""}
        open={subcultureOpen}
        onOpenChange={setSubcultureOpen}
      />

      <RemoveVesselsDialog
        sampleId={sampleId}
        sampleCode={sample.sampleCode}
        currentQuantity={sample.quantity}
        open={removeVesselsOpen}
        onOpenChange={setRemoveVesselsOpen}
        onDeleted={() => setLocation("/samples")}
      />
    </div>
  );
}
