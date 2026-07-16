import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateSample, useListSamples, getListSamplesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptions } from "@/hooks/use-options";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Wand2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";
import { FixedOrCustomSelect } from "@/components/fixed-or-custom-select";

const STAGE_SCHEDULE: Record<string, { action: string; daysUntilNext: number }> = {
  initiation: { action: "Transfer to multiplication", daysUntilNext: 21 },
  multiplication: { action: "Subculture (multiplication)", daysUntilNext: 21 },
  rooting: { action: "Transfer to acclimatization", daysUntilNext: 14 },
  acclimatization: { action: "Transfer to long-term storage", daysUntilNext: 30 },
};

/** Regex for root code: 2 letters + 2-digit year + _ + 3-digit sequence, e.g. FA26_001 */
const CODE_RE = /^[A-Za-z]{2}\d{2}_\d{3}$/;

const formSchema = z.object({
  sampleCode: z
    .string()
    .min(1, "Sample code is required")
    .regex(CODE_RE, "Format: XX26_001 — 2 letters · 2-digit year · _ · 3 digits"),
  cultivar: z.string().min(1, "Cultivar is required"),
  stage: z.string().min(1, "Stage is required"),
  mediaType: z.string().optional(),
  containerType: z.string().optional(),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  location: z.string().min(1, "Location is required"),
  status: z.string().min(1, "Status is required"),
  notes: z.string().optional(),
  dateInitiated: z.string().min(1, "Date is required"),
  nextActionDate: z.string().optional(),
  nextAction: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewSample() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSample = useCreateSample();
  const { data: allSamples } = useListSamples();

  const { data: stageOptions } = useOptions("stage");
  const { data: mediaOptions } = useOptions("media");
  const { data: containerOptions } = useOptions("container");
  const stages = useMemo(() => stageOptions?.map((o) => o.label) ?? [], [stageOptions]);
  const mediaTypes = useMemo(() => mediaOptions?.map((o) => o.label) ?? [], [mediaOptions]);
  const containers = useMemo(() => containerOptions?.map((o) => o.label) ?? [], [containerOptions]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sampleCode: "",
      cultivar: "",
      stage: "",
      mediaType: "",
      containerType: "",
      quantity: 1,
      location: "",
      status: "active",
      notes: "",
      dateInitiated: new Date().toISOString().split("T")[0],
      nextActionDate: "",
      nextAction: "",
    },
  });

  function generateCode() {
    const currentYY = new Date().getFullYear().toString().slice(-2);
    const samples = allSamples ?? [];

    const rootRe = /^([A-Za-z]{2})(\d{2})_(\d{3})$/;
    const roots = samples
      .map((s) => s.sampleCode.match(rootRe))
      .filter(Boolean) as RegExpMatchArray[];

    if (roots.length === 0) {
      form.setValue("sampleCode", `FA${currentYY}_001`);
      return;
    }

    const thisYear = roots.filter((m) => m[2] === currentYY);
    const pool = thisYear.length > 0 ? thisYear : roots;

    const maxSeq: Record<string, number> = {};
    for (const m of pool) {
      const key = `${m[1].toUpperCase()}${m[2]}`;
      const seq = parseInt(m[3], 10);
      maxSeq[key] = Math.max(maxSeq[key] ?? 0, seq);
    }

    const [bestKey] = Object.entries(maxSeq).sort((a, b) => b[1] - a[1])[0];
    const prefix = bestKey.slice(0, 2).toUpperCase();
    const yr = bestKey.slice(2);
    const next = (maxSeq[bestKey] + 1).toString().padStart(3, "0");
    form.setValue("sampleCode", `${prefix}${yr}_${next}`);
  }

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
    createSample.mutate(
      {
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
        onSuccess: (sample) => {
          queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
          toast({ title: "Sample created", description: `${sample.sampleCode} has been added to inventory.` });
          setLocation(`/samples/${sample.id}`);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to create sample.", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/samples">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Samples
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Sample</h1>
        <p className="text-muted-foreground mt-1">Register a new tissue culture sample</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sample Information</CardTitle>
              <CardDescription>Enter the details for the new tissue culture sample</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="sampleCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sample Code</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          placeholder="FA26_001"
                          {...field}
                          className="font-mono"
                          data-testid="input-sample-code"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={generateCode}
                          title="Auto-generate next code"
                          data-testid="button-generate-code"
                        >
                          <Wand2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </FormControl>
                    <p className="text-[11px] text-muted-foreground mt-1">Format: 2 letters · 2-digit year · _ · 3 digits &nbsp;(e.g. FA26_001)</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dateInitiated" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Initiated</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-date-initiated" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cultivar" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cultivar / Variety</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Atlantic" {...field} data-testid="input-cultivar" />
                    </FormControl>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <FormControl>
                      <Input type="number" min="1" {...field} data-testid="input-quantity" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Shelf A-1" {...field} data-testid="input-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="mt-6">
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Observations, subculture schedule, etc. (optional)" rows={3} {...field} data-testid="textarea-notes" />
                    </FormControl>
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
                  <CardDescription>Schedule the next subculture or stage transition for this sample</CardDescription>
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
                      <Input placeholder="e.g. Transfer to multiplication" {...field} data-testid="input-next-action" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="mt-4 p-3 bg-muted rounded-md text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Typical schedule (click &quot;Suggest from stage&quot; to auto-fill):</p>
                <p>Initiation → Transfer to multiplication: 21 days</p>
                <p>Multiplication → Subculture: 21 days</p>
                <p>Rooting → Transfer to acclimatization: 14 days</p>
                <p>Acclimatization → Long-term storage: 30 days</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/samples">
              <Button type="button" variant="outline" data-testid="button-cancel">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createSample.isPending} data-testid="button-submit">
              {createSample.isPending ? "Creating..." : "Create Sample"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
