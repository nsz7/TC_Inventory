import { useState, useMemo } from "react";
import { useSubcultureSample, useListSamples } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptions } from "@/hooks/use-options";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GitBranch } from "lucide-react";
import { getListSamplesQueryKey, getGetSampleQueryKey } from "@workspace/api-client-react";
import { FixedOrCustomSelect, CUSTOM_VALUE } from "@/components/fixed-or-custom-select";


interface OutputRow {
  stage: string;
  containerType: string;
  quantity: number;
  location: string;
  mediaType: string;
  notes: string;
}

interface SubcultureDialogProps {
  sampleId: number;
  sampleCode: string;
  parentStage: string;
  parentContainer: string;
  parentLocation: string;
  parentMedia: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubcultureDialog({
  sampleId,
  sampleCode,
  parentStage,
  parentContainer,
  parentLocation,
  parentMedia,
  open,
  onOpenChange,
}: SubcultureDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const subcultureMutation = useSubcultureSample();

  const { data: allSamples } = useListSamples({});
  const { data: stageOptions } = useOptions("stage");
  const { data: containerOptions } = useOptions("container");
  const stages = useMemo(() => stageOptions?.map((o) => o.label) ?? [], [stageOptions]);
  const containers = useMemo(() => containerOptions?.map((o) => o.label) ?? [], [containerOptions]);

  const knownLocations = useMemo(() => {
    const vals = (allSamples ?? [])
      .map((s) => s.location)
      .filter(Boolean) as string[];
    return Array.from(new Set([parentLocation, ...vals].filter(Boolean))).sort();
  }, [allSamples, parentLocation]);

  const knownMediaTypes = useMemo(() => {
    const vals = (allSamples ?? [])
      .map((s) => s.mediaType)
      .filter(Boolean) as string[];
    const base = parentMedia ? [parentMedia, ...vals] : vals;
    return Array.from(new Set(base)).sort();
  }, [allSamples, parentMedia]);

  const defaultOutput = (): OutputRow => ({
    stage: parentStage,
    containerType: parentContainer,
    quantity: 1,
    location: parentLocation,
    mediaType: parentMedia,
    notes: "",
  });

  const today = new Date().toISOString().split("T")[0];
  const [transferDate, setTransferDate] = useState(today);
  const [technician, setTechnician] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [outputs, setOutputs] = useState<OutputRow[]>([defaultOutput()]);

  function updateOutput(index: number, field: keyof OutputRow, value: string | number) {
    setOutputs((prev) =>
      prev.map((o, i) => (i === index ? { ...o, [field]: value } : o)),
    );
  }

  function addOutput() {
    setOutputs((prev) => [...prev, defaultOutput()]);
  }

  function removeOutput(index: number) {
    setOutputs((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setTransferDate(today);
    setTechnician("");
    setGeneralNotes("");
    setOutputs([defaultOutput()]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const valid = outputs.every((o) => o.stage && o.quantity > 0 && o.location);
    if (!valid) {
      toast({ title: "Missing fields", description: "Each output needs a stage, quantity, and location.", variant: "destructive" });
      return;
    }
    if (!technician.trim()) {
      toast({ title: "Missing technician", description: "Please enter your name.", variant: "destructive" });
      return;
    }

    subcultureMutation.mutate(
      {
        id: sampleId,
        data: {
          transferDate,
          technician: technician.trim(),
          notes: generalNotes.trim() || null,
          outputs: outputs.map((o) => ({
            stage: o.stage,
            containerType: o.containerType || null,
            quantity: Number(o.quantity),
            location: o.location,
            mediaType: o.mediaType || null,
            notes: o.notes || null,
          })),
        },
      },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSampleQueryKey(sampleId) });
          toast({
            title: "Subculture recorded",
            description: `${sampleCode} → ${result.children.length} new batch${result.children.length > 1 ? "es" : ""}: ${result.children.map((c) => c.sampleCode).join(", ")}`,
          });
          reset();
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to record subculture.", variant: "destructive" });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Subculture / Split — <span className="font-mono">{sampleCode}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Transfer Date</Label>
              <Input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Technician</Label>
              <Input
                placeholder="Your name"
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Output Batches</p>
              <Button type="button" variant="outline" size="sm" onClick={addOutput}>
                <Plus className="h-4 w-4 mr-1" />Add output
              </Button>
            </div>

            {outputs.map((output, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Output {idx + 1}</p>
                  {outputs.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOutput(idx)}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Stage *</Label>
                    <FixedOrCustomSelect
                      value={output.stage}
                      options={stages}
                      placeholder="Select stage"
                      onChange={(v) => updateOutput(idx, "stage", v)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Container Type</Label>
                    <FixedOrCustomSelect
                      value={output.containerType}
                      options={containers}
                      placeholder="Select container"
                      onChange={(v) => updateOutput(idx, "containerType", v)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Quantity *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={output.quantity}
                      onChange={(e) => updateOutput(idx, "quantity", Number(e.target.value))}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Location *</Label>
                    <LocationSelect
                      value={output.location}
                      options={knownLocations}
                      onChange={(v) => updateOutput(idx, "location", v)}
                    />
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Media Type</Label>
                    <MediaSelect
                      value={output.mediaType}
                      options={knownMediaTypes}
                      onChange={(v) => updateOutput(idx, "mediaType", v)}
                    />
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Notes for this batch</Label>
                    <Textarea
                      placeholder="Optional notes…"
                      value={output.notes}
                      onChange={(e) => updateOutput(idx, "notes", e.target.value)}
                      className="resize-none h-16"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">General Transfer Notes</Label>
            <Textarea
              placeholder="Notes that apply to all outputs…"
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              className="resize-none h-20"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={subcultureMutation.isPending}>
              {subcultureMutation.isPending ? "Recording…" : `Record Subculture (${outputs.length} output${outputs.length > 1 ? "s" : ""})`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LocationSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const isCustom = value !== "" && !options.includes(value);
  const [showCustom, setShowCustom] = useState(isCustom);

  function handleSelect(v: string) {
    if (v === CUSTOM_VALUE) {
      setShowCustom(true);
      onChange("");
    } else {
      setShowCustom(false);
      onChange(v);
    }
  }

  if (showCustom) {
    return (
      <div className="flex gap-1">
        <Input
          placeholder="Enter location"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          required
        />
        {options.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs px-2" onClick={() => { setShowCustom(false); onChange(options[0]); }}>
            ↩
          </Button>
        )}
      </div>
    );
  }

  return (
    <Select value={value || ""} onValueChange={handleSelect}>
      <SelectTrigger>
        <SelectValue placeholder="Select location" />
      </SelectTrigger>
      <SelectContent>
        {options.map((loc) => (
          <SelectItem key={loc} value={loc}>{loc}</SelectItem>
        ))}
        <SelectItem value={CUSTOM_VALUE} className="text-muted-foreground italic">
          + Type new location…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function MediaSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const isCustom = value !== "" && !options.includes(value);
  const [showCustom, setShowCustom] = useState(isCustom);

  function handleSelect(v: string) {
    if (v === CUSTOM_VALUE) {
      setShowCustom(true);
      onChange("");
    } else {
      setShowCustom(false);
      onChange(v);
    }
  }

  if (showCustom) {
    return (
      <div className="flex gap-1">
        <Input
          placeholder="e.g. MS + 0.1mg/L BAP"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        {options.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs px-2" onClick={() => { setShowCustom(false); onChange(options[0]); }}>
            ↩
          </Button>
        )}
      </div>
    );
  }

  return (
    <Select value={value || ""} onValueChange={handleSelect}>
      <SelectTrigger>
        <SelectValue placeholder="Select or leave blank" />
      </SelectTrigger>
      <SelectContent>
        {options.map((m) => (
          <SelectItem key={m} value={m}>{m}</SelectItem>
        ))}
        <SelectItem value={CUSTOM_VALUE} className="text-muted-foreground italic">
          + Type new media type…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
