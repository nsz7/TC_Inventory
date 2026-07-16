import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link } from "wouter";
import {
  useCreateTransfer,
  useListSamples,
  getListTransfersQueryKey,
  getGetSampleTransfersQueryKey,
  getListSamplesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSearch } from "wouter";

const formSchema = z.object({
  fromSampleId: z.coerce.number().int().min(1, "Source sample is required"),
  toSampleId: z.string().optional(),
  transferDate: z.string().min(1, "Transfer date is required"),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  mediaType: z.string().optional(),
  quantityTransferred: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  technician: z.string().min(1, "Technician name is required"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewTransfer() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preselectedSampleId = params.get("fromSampleId");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTransfer = useCreateTransfer();

  const { data: samples } = useListSamples(
    { status: "active" },
    { query: { queryKey: getListSamplesQueryKey({ status: "active" }) } },
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fromSampleId: preselectedSampleId ? Number(preselectedSampleId) : (undefined as unknown as number),
      toSampleId: "",
      transferDate: new Date().toISOString().split("T")[0],
      fromLocation: "",
      toLocation: "",
      mediaType: "",
      quantityTransferred: 1,
      technician: "",
      notes: "",
    },
  });

  function handleFromSampleChange(sampleIdStr: string, fieldOnChange: (v: number) => void) {
    const sampleId = Number(sampleIdStr);
    fieldOnChange(sampleId);
    // Auto-fill fromLocation and mediaType from the selected sample
    const selected = samples?.find((s) => s.id === sampleId);
    if (selected) {
      if (selected.location) form.setValue("fromLocation", selected.location);
      if (selected.mediaType) form.setValue("mediaType", selected.mediaType);
    }
  }

  function onSubmit(values: FormValues) {
    const toSampleIdVal =
      values.toSampleId && values.toSampleId !== "none"
        ? Number(values.toSampleId)
        : undefined;

    createTransfer.mutate(
      {
        data: {
          fromSampleId: values.fromSampleId,
          toSampleId: toSampleIdVal,
          transferDate: values.transferDate,
          fromLocation: values.fromLocation || undefined,
          toLocation: values.toLocation || undefined,
          mediaType: values.mediaType || undefined,
          quantityTransferred: values.quantityTransferred,
          technician: values.technician,
          notes: values.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSampleTransfersQueryKey(values.fromSampleId) });
          toast({ title: "Transfer recorded", description: "The transfer has been logged." });
          setLocation("/transfers");
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to record transfer.", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/transfers">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Transfers
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Record Transfer</h1>
        <p className="text-muted-foreground mt-1">Log a subculture or transfer event</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer Details</CardTitle>
          <CardDescription>
            Selecting the source sample will auto-fill its current location and media type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="fromSampleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Sample</FormLabel>
                      <Select
                        onValueChange={(v) => handleFromSampleChange(v, field.onChange)}
                        value={field.value ? String(field.value) : ""}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-from-sample">
                            <SelectValue placeholder="Select source sample" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {samples?.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              <span className="font-mono">{s.sampleCode}</span> — {s.cultivar}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="toSampleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Destination Sample</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-to-sample">
                            <SelectValue placeholder="Select destination (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">External / No destination</SelectItem>
                          {samples?.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              <span className="font-mono">{s.sampleCode}</span> — {s.cultivar}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="transferDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transfer Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-transfer-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="technician"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Technician</FormLabel>
                      <FormControl>
                        <Input placeholder="Name of person performing transfer" {...field} data-testid="input-technician" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantityTransferred"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity Transferred</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} data-testid="input-quantity" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mediaType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Media Type
                        <span className="text-xs text-muted-foreground ml-2">(auto-filled from sample)</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="MS + 0.1mg/L BAP (optional)" {...field} data-testid="input-media-type" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fromLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        From Location
                        <span className="text-xs text-muted-foreground ml-2">(auto-filled from sample)</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Shelf A-1" {...field} data-testid="input-from-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="toLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To Location</FormLabel>
                      <FormControl>
                        <Input placeholder="Shelf B-2 (optional)" {...field} data-testid="input-to-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Observations, reason for transfer, etc. (optional)"
                        rows={3}
                        {...field}
                        data-testid="textarea-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-3">
                <Link href="/transfers">
                  <Button type="button" variant="outline" data-testid="button-cancel">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={createTransfer.isPending} data-testid="button-submit">
                  {createTransfer.isPending ? "Recording..." : "Record Transfer"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
