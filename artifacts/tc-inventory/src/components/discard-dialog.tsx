import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useOptions } from "@/hooks/use-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface DiscardDialogProps {
  batchId: number;
  maxQuantity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The one entry point for a standalone discard — the transfer dialog's
 * "close out source" checkbox is the other, and both hit the same backend
 * mechanism (recordDiscard) so they behave identically.
 */
export function DiscardDialog({ batchId, maxQuantity, open, onOpenChange }: DiscardDialogProps) {
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: reasonOptions } = useOptions("discard_reason");

  const discard = useMutation({
    mutationFn: () =>
      apiFetch(`/api/batches/${batchId}/discard`, {
        method: "POST",
        body: JSON.stringify({
          quantity: Number(quantity),
          reason,
          eventDate,
          note: note || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batch", batchId] });
      queryClient.invalidateQueries({ queryKey: ["batch-timeline", batchId] });
      queryClient.invalidateQueries({ queryKey: ["samples"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast({ title: "Discard recorded" });
      setQuantity("");
      setReason("");
      setNote("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ title: "Could not record discard", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    },
  });

  const quantityNum = Number(quantity);
  const canSubmit = quantityNum > 0 && quantityNum <= maxQuantity && reason.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard containers</DialogTitle>
          <DialogDescription>Up to {maxQuantity} containers available in this batch.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) discard.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="discard-quantity">Quantity</Label>
              <Input
                id="discard-quantity"
                type="number"
                min={1}
                max={maxQuantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                data-testid="input-discard-quantity"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discard-date">Date</Label>
              <Input id="discard-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="discard-reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="discard-reason" data-testid="select-discard-reason">
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
          <div className="space-y-2">
            <Label htmlFor="discard-note">Note (optional)</Label>
            <Textarea id="discard-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!canSubmit || discard.isPending} data-testid="button-submit-discard">
              {discard.isPending ? "Recording…" : "Record discard"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
