import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useOptions } from "@/hooks/use-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Variety {
  id: number;
  label: string;
}
interface Strain {
  id: number;
  varietyId: number;
  label: string;
}

/** New sample = new identity + its initiation batch, created together. */
export default function NewSample() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [categoryCode, setCategoryCode] = useState("");
  const [varietyId, setVarietyId] = useState<string>("");
  const [strainId, setStrainId] = useState<string>("");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [medium, setMedium] = useState("");
  const [containerType, setContainerType] = useState("");
  const [location, setLocation] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  const { data: categoryOptions } = useOptions("category_code");
  const { data: varieties } = useQuery({ queryKey: ["varieties"], queryFn: () => apiFetch<Variety[]>("/api/varieties") });
  const { data: strains } = useQuery({
    queryKey: ["strains", varietyId],
    queryFn: () => apiFetch<Strain[]>(`/api/strains?varietyId=${varietyId}`),
    enabled: !!varietyId,
  });
  const { data: mediaOptions } = useOptions("media");
  const { data: containerOptions } = useOptions("container");
  const { data: locationOptions } = useOptions("location");

  // Every variety has at least one strain; pre-select it the moment it's the
  // only option, since most varieties only have "Standard" and shouldn't
  // force an extra click.
  useEffect(() => {
    if (strains && strains.length === 1) {
      setStrainId(String(strains[0].id));
    }
  }, [strains]);

  const createSample = useMutation({
    mutationFn: () =>
      apiFetch<{ sample: { id: number }; batch: { id: number } }>("/api/samples", {
        method: "POST",
        body: JSON.stringify({
          categoryCode,
          varietyId: Number(varietyId),
          strainId: Number(strainId),
          transferDate,
          medium: medium || undefined,
          containerType: containerType || undefined,
          location,
          initialQuantity: Number(initialQuantity),
          notes: notes || undefined,
        }),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["samples"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Sample created" });
      navigate(`/batches/${result.batch.id}`);
    },
    onError: (error) => {
      toast({ title: "Could not create sample", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    },
  });

  const canSubmit =
    categoryCode.length === 2 &&
    !!varietyId &&
    !!strainId &&
    location.length > 0 &&
    Number(initialQuantity) > 0 &&
    transferDate.length > 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/samples">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Samples
        </Button>
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Sample</h1>
        <p className="text-muted-foreground mt-1">Creates the sample identity and its initiation batch together.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sample Information</CardTitle>
          <CardDescription>The sample code is assigned automatically from the category and year.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) createSample.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category code</Label>
                <Select value={categoryCode} onValueChange={setCategoryCode}>
                  <SelectTrigger data-testid="select-category-code">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categoryOptions ?? []).map((o: { id: number; label: string }) => (
                      <SelectItem key={o.id} value={o.label}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transfer date</Label>
                <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                <Label>Strain</Label>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Medium (optional)</Label>
                <Select value={medium} onValueChange={setMedium}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select medium" />
                  </SelectTrigger>
                  <SelectContent>
                    {(mediaOptions ?? []).map((o: { id: number; label: string }) => (
                      <SelectItem key={o.id} value={o.label}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Container type (optional)</Label>
                <Select value={containerType} onValueChange={setContainerType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select container" />
                  </SelectTrigger>
                  <SelectContent>
                    {(containerOptions ?? []).map((o: { id: number; label: string }) => (
                      <SelectItem key={o.id} value={o.label}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger data-testid="select-location">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {(locationOptions ?? []).map((o: { id: number; label: string }) => (
                      <SelectItem key={o.id} value={o.label}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Initial quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={initialQuantity}
                  onChange={(e) => setInitialQuantity(e.target.value)}
                  required
                  data-testid="input-initial-quantity"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/samples">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={!canSubmit || createSample.isPending} data-testid="button-submit">
                {createSample.isPending ? "Creating…" : "Create Sample"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
