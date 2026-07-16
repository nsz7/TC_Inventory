import { useParams, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetSample,
  getGetSampleQueryKey,
  useUpdateSample,
  getListSamplesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptions } from "@/hooks/use-options";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";
import { FixedOrCustomSelect } from "@/components/fixed-or-custom-select";

const STAGE_SCHEDULE: Record<string, { action: string; daysUntilNext: number }> = {
  initiation: { action: "Transfer to multiplication", daysUntilNext: 21 },
  multiplication: { action: "Subculture (multiplication)", daysUntilNext: 21 },
  rooting: { action: "Transfer to acclimatization", daysUntilNext: 14 },
  acclimatization: { action: "Transfer to long-term storage", daysUntilNext: 30 },
};

const formSchema = z.object({
  sampleCode: z.string().min(1, "Sample code is required"),
  cultivar: z.string().min(1, "Cultivar is required"),
  stage: z.string().min(1, "Stage is required"),
  mediaType: z.string().optional(),
  containerType: z.string().optional(),
  quantity: z.coerce.number().int().min(1),
  location: z.string().min(1, "Location is required"),
  status: z.string().min(1, "Status is required"),
  notes: z.string().optional(),
  dateInitiated: z.string().min(1, "Date is required"),
  nextActionDate: z.string().optional(),
  nextAction: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ── Loader shell ──────────────────────────────────────────────────────────────
export default function EditSample() {
  const { id } = useParams<{ id: string }>();
  const sampleId = Number(id);

  const { data: sample, isLoading } = useGetSample(sampleId, {
    query: { enabled: !!sampleId, queryKey: getGetSampleQueryKey(sampleId) },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!sample) {
    return <p className="text-muted-foreground p-8">Sample not found.</p>;
  }

  return <EditSampleForm sample={sample} sampleId={sampleId} />;
}

// ── Form (only rendered once sample is available, so defaultValues are correct) ─
function EditSampleForm({
  sample,
  sampleId,
}: {
  sample: NonNullable<ReturnType<typeof useGetSample>["data"]>;
  sampleId: number;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSample = useUpdateSample();

  const { data: stageOptions } = useOptions("stage");
  const { data: mediaOptions } = useOptions("media");
  const { data: containerOptions } = useOptions("container");
  const stages = useMemo(() => stageOptions?.map((o) => o.label) ?? [], [stageOptions]);
  const mediaTypes = useMemo(() => mediaOptions?.map((o) => o.label) ?? [], [mediaOptions]);
  const containers = useMemo(() => containerOptions?.map((o) => o.label) ?? [], [containerOptions]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sampleCode: sample.sampleCode,
      cultivar: sample.cultivar,
      stage: sample.stage,
      mediaType: sample.mediaType ?? "",
      containerType: sample.containerType ?? "",
      quantity: sample.quantity,
      location: sample.location,
      status: sample.status,
      notes: sample.notes ?? "",
      dateInitiated: sample.dateInitiated,
      nextActionDate: sample.nextActionDate ?? "",
      nextAction: sample.nextAction ?? "",
    },
  });

  function suggestSchedule() {
    const stage = form.getValues("stage");
    const dateInitiated = form.getValues("dateInitiated");
    const schedule = STAGE_SCHEDULE[stage];
    if (!schedule || !dateInitiated) return;
    const nextDate = addDays(new Date(dateInitiated), schedule.daysUntilNext);
    form.setValue("nextActionDate", format(nextDate, "yyyy-MM-dd"));
    form.setValue("nextAction", schedule.action);
  }

  function onSubmit(values: FormValues) {
    updateSample.mutate(
      {
        id: sampleId,
        data: {
          sampleCode: values.sampleCode,
          cultivar: values.cultivar,
          stage: values.stage,
          mediaType: values.mediaType || undefined,
          containerType: values.containerType || undefined,
          quantity: values.quantity,
          location: values.location,
          status: values.status,
          notes: values.notes || undefined,
          dateInitiated: values.dateInitiated,
          nextActionDate: values.nextActionDate || undefined,
          nextAction: values.nextAction || undefined,
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getGetSampleQueryKey(sampleId) });
          queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
          toast({ title: "Sample updated", description: `${updated.sampleCode} has been saved.` });
          setLocation(`/samples/${sampleId}`);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update sample.", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/samples/${sampleId}`}>
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Sample</h1>
        <p className="text-muted-foreground mt-1 font-mono">{sample.sampleCode}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sample Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="sampleCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sample Code</FormLabel>
                    <FormControl><Input {...field} data-testid="input-sample-code" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dateInitiated" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Initiated</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-date-initiated" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cultivar" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cultivar / Variety</FormLabel>
                    <FormControl><Input {...field} data-testid="input-cultivar" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="stage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage *</FormLabel>
                    <FixedOrCustomSelect
                      value={field.value ?? ""}
                      options={stages}
                      placeholder="Select stage"
                      onChange={field.onChange}
                      required
                    />
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="contaminated">Contaminated</SelectItem>
                        <SelectItem value="discarded">Discarded</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mediaType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Media Type</FormLabel>
                    <FixedOrCustomSelect
                      value={field.value ?? ""}
                      options={mediaTypes}
                      placeholder="Select media type"
                      onChange={field.onChange}
                    />
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="containerType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Container Type</FormLabel>
                    <FixedOrCustomSelect
                      value={field.value ?? ""}
                      options={containers}
                      placeholder="Select container type"
                      onChange={field.onChange}
                    />
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity (vessels)</FormLabel>
                    <FormControl><Input type="number" min="1" {...field} data-testid="input-quantity" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl><Input {...field} data-testid="input-location" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="mt-6">
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl><Textarea rows={3} {...field} data-testid="textarea-notes" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Next Scheduled Action</CardTitle>
                  <CardDescription>Update the schedule for the next subculture or stage transition</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={suggestSchedule}
                  data-testid="button-suggest-schedule"
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Suggest from stage
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="nextActionDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Next Action Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-next-action-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nextAction" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Next Action</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Subculture (multiplication)" {...field} data-testid="input-next-action" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Link href={`/samples/${sampleId}`}>
              <Button type="button" variant="outline" data-testid="button-cancel">Cancel</Button>
            </Link>
            <Button type="submit" disabled={updateSample.isPending} data-testid="button-submit">
              {updateSample.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
