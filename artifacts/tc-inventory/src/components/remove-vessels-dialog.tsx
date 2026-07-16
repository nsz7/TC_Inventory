import { useState } from "react";
import { useUpdateSample, useDeleteSample, getGetSampleQueryKey, getListSamplesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const PRESET_REASONS = [
  { value: "contamination", label: "Contamination" },
  { value: "low vigor", label: "Low vigor / poor growth" },
  { value: "mechanical damage", label: "Mechanical damage" },
  { value: "senescence", label: "Senescence / over-age" },
  { value: "custom", label: "Other (custom)…" },
];

interface RemoveVesselsDialogProps {
  sampleId: number;
  sampleCode: string;
  currentQuantity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function RemoveVesselsDialog({
  sampleId,
  sampleCode,
  currentQuantity,
  open,
  onOpenChange,
  onDeleted,
}: RemoveVesselsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSample = useUpdateSample();
  const deleteSample = useDeleteSample();

  const [count, setCount] = useState(1);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const newQuantity = currentQuantity - count;
  const deletesAll = newQuantity <= 0;

  const resolvedReason = reason === "custom" ? customReason.trim() : reason;

  function reset() {
    setCount(1);
    setReason("");
    setCustomReason("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvedReason) {
      toast({ title: "Reason required", description: "Please select or enter a reason.", variant: "destructive" });
      return;
    }
    if (count < 1 || count > currentQuantity) {
      toast({ title: "Invalid count", description: `Count must be between 1 and ${currentQuantity}.`, variant: "destructive" });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const logEntry = `[${today}] Removed ${count} vessel${count !== 1 ? "s" : ""} — Reason: ${resolvedReason}`;

    if (deletesAll) {
      deleteSample.mutate(
        { id: sampleId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetSampleQueryKey(sampleId) });
            toast({ title: "Sample deleted", description: `${sampleCode} removed (${resolvedReason}).` });
            reset();
            onOpenChange(false);
            onDeleted?.();
          },
          onError: () => toast({ title: "Error", description: "Failed to delete sample.", variant: "destructive" }),
        },
      );
    } else {
      updateSample.mutate(
        {
          id: sampleId,
          data: {
            quantity: newQuantity,
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetSampleQueryKey(sampleId) });
            queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
            toast({
              title: "Vessels removed",
              description: `${sampleCode}: ${currentQuantity} → ${newQuantity} vessels. Reason: ${resolvedReason}.`,
            });
            reset();
            onOpenChange(false);
          },
          onError: () => toast({ title: "Error", description: "Failed to update vessel count.", variant: "destructive" }),
        },
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove Vessels — <span className="font-mono">{sampleCode}</span></DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label>Vessels to remove</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={currentQuantity}
                value={count}
                onChange={(e) => setCount(Math.min(currentQuantity, Math.max(1, Number(e.target.value))))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                of {currentQuantity} total
                {!deletesAll && (
                  <span className="ml-1 font-medium text-foreground">→ {newQuantity} remaining</span>
                )}
              </span>
            </div>
            {deletesAll && (
              <p className="text-sm text-destructive font-medium">
                ⚠ This removes all vessels and will delete this sample record entirely.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {PRESET_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === "custom" && (
            <div className="space-y-1.5">
              <Label>Describe reason</Label>
              <Textarea
                placeholder="e.g. vitrification, media contamination…"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="resize-none h-20"
                required
              />
            </div>
          )}

          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            A log entry will be saved:{" "}
            <span className="font-mono text-xs">
              [{new Date().toISOString().split("T")[0]}] Removed {count} vessel{count !== 1 ? "s" : ""}
              {resolvedReason ? ` — Reason: ${resolvedReason}` : ""}
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={deletesAll ? "destructive" : "default"}
              disabled={updateSample.isPending || deleteSample.isPending}
            >
              {deletesAll ? "Delete Record" : `Remove ${count} Vessel${count !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
