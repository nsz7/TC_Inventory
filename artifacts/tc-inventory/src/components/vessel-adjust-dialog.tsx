import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useOptions } from "@/hooks/use-options";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface VesselAdjustDialogProps {
  batchId: number;
  batchLabel: string;
  currentQuantity: number;
  newQuantity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
}

/**
 * The Vessels figure is computed, never stored — typing a new number here
 * never writes that number anywhere. It only ever creates the event that
 * explains the difference: a discard (decrease) or a correction (increase),
 * each with a required reason from its own list. This is the one place
 * that translates an edited display number back into an event; get it
 * wrong and the audit trail the whole model exists for is gone.
 */
export function VesselAdjustDialog({
  batchId,
  batchLabel,
  currentQuantity,
  newQuantity,
  open,
  onOpenChange,
  onCancel,
}: VesselAdjustDialogProps) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isDecrease = newQuantity < currentQuantity;
  const diff = Math.abs(newQuantity - currentQuantity);
  const { data: discardReasons } = useOptions("discard_reason");
  const { data: correctionReasons } = useOptions("correction_reason");
  const reasonOptions = isDecrease ? discardReasons : correctionReasons;

  const adjust = useMutation({
    mutationFn: () =>
      isDecrease
        ? apiFetch(`/api/batches/${batchId}/discard`, {
            method: "POST",
            body: JSON.stringify({ quantity: diff, reason, eventDate: new Date().toISOString().slice(0, 10) }),
          })
        : apiFetch(`/api/batches/${batchId}/correction`, {
            method: "POST",
            body: JSON.stringify({ quantity: diff, reason, eventDate: new Date().toISOString().slice(0, 10) }),
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["samples"] });
      queryClient.invalidateQueries({ queryKey: ["batch", batchId] });
      queryClient.invalidateQueries({ queryKey: ["batch-timeline", batchId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: isDecrease ? "Discard recorded" : "Correction recorded" });
      setReason("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: isDecrease ? "Could not record discard" : "Could not record correction",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      onCancel();
    },
  });

  function handleCancel() {
    setReason("");
    onCancel();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isDecrease ? "Discard" : "Correction"} — {batchLabel}</DialogTitle>
          <DialogDescription>
            {isDecrease
              ? `Vessels ${currentQuantity} → ${newQuantity}: records a discard of ${diff}.`
              : `Vessels ${currentQuantity} → ${newQuantity}: records a correction of +${diff}.`}
            {isDecrease && newQuantity === 0 && " This will fully deplete the batch."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger data-testid="select-vessel-adjust-reason">
              <SelectValue placeholder="Select a reason" />
            </SelectTrigger>
            <SelectContent>
              {(reasonOptions ?? []).map((o: { id: number; label: string }) => (
                <SelectItem key={o.id} value={o.label}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => adjust.mutate()}
            disabled={!reason || adjust.isPending}
            data-testid="button-confirm-vessel-adjust"
          >
            {adjust.isPending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
