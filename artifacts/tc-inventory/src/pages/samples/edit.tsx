import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Sample {
  id: number;
  sampleCode: string;
  varietyId: number;
  strainId: number | null;
}
interface Variety {
  id: number;
  label: string;
}
interface Strain {
  id: number;
  varietyId: number;
  label: string;
}

/** Only variety/strain are editable here — everything else describing a
 * batch (stage, location, quantity...) lives on batches now, edited via
 * transfer/discard/correction, not a sample-level form. */
export default function EditSample() {
  const params = useParams();
  const [, navigate] = useLocation();
  const sampleId = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sample, isLoading } = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => apiFetch<Sample>(`/api/samples/${sampleId}`),
  });
  const { data: varieties } = useQuery({ queryKey: ["varieties"], queryFn: () => apiFetch<Variety[]>("/api/varieties") });

  const [varietyId, setVarietyId] = useState<string>("");
  const [strainId, setStrainId] = useState<string>("");

  useEffect(() => {
    if (sample) {
      setVarietyId(String(sample.varietyId));
      setStrainId(sample.strainId ? String(sample.strainId) : "");
    }
  }, [sample]);

  const { data: strains } = useQuery({
    queryKey: ["strains", varietyId],
    queryFn: () => apiFetch<Strain[]>(`/api/strains?varietyId=${varietyId}`),
    enabled: !!varietyId,
  });

  const updateSample = useMutation({
    mutationFn: () =>
      apiFetch(`/api/samples/${sampleId}`, {
        method: "PATCH",
        body: JSON.stringify({ varietyId: Number(varietyId), strainId: strainId ? Number(strainId) : null }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["samples"] });
      queryClient.invalidateQueries({ queryKey: ["sample", sampleId] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast({ title: "Sample updated" });
      navigate(`/samples`);
    },
    onError: (error) => {
      toast({ title: "Could not update sample", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-lg">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!sample) return <p className="text-muted-foreground p-8">Sample not found.</p>;

  return (
    <div className="space-y-6 max-w-lg">
      <Link href="/samples">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Samples
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">{sample.sampleCode}</h1>
        <p className="text-muted-foreground mt-1">Edit variety and strain</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Variety &amp; strain</CardTitle>
          <CardDescription>Changes are recorded in this sample's change log.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateSample.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Variety</Label>
              <Select
                value={varietyId}
                onValueChange={(v) => {
                  setVarietyId(v);
                  setStrainId("");
                }}
              >
                <SelectTrigger data-testid="select-variety">
                  <SelectValue placeholder="Select variety" />
                </SelectTrigger>
                <SelectContent>
                  {(varieties ?? []).map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Strain (optional)</Label>
              <Select value={strainId} onValueChange={setStrainId} disabled={!varietyId}>
                <SelectTrigger data-testid="select-strain">
                  <SelectValue placeholder={varietyId ? "Select strain" : "Select a variety first"} />
                </SelectTrigger>
                <SelectContent>
                  {(strains ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Link href="/samples">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={!varietyId || updateSample.isPending} data-testid="button-submit">
                {updateSample.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
