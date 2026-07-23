import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useOptions } from "@/hooks/use-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface EditableBatch {
  id: number;
  stage: string;
  medium: string | null;
  containerType: string | null;
  location: string;
  transferDate: string;
  notes: string | null;
  dueDateOverride: string | null;
}

interface BatchEditDialogProps {
  batch: EditableBatch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Full field editing — stage, medium, container type, location, transfer
 * date, notes, and the per-batch due-date override. Every change here is
 * recorded in the change log. Never touches quantity — that's exclusively
 * discard/correction events. */
export function BatchEditDialog({ batch, open, onOpenChange }: BatchEditDialogProps) {
  const [stage, setStage] = useState(batch.stage);
  const [medium, setMedium] = useState(batch.medium ?? "");
  const [containerType, setContainerType] = useState(batch.containerType ?? "");
  const [location, setLocation] = useState(batch.location);
  const [transferDate, setTransferDate] = useState(batch.transferDate.slice(0, 10));
  const [notes, setNotes] = useState(batch.notes ?? "");
  const [dueDateOverride, setDueDateOverride] = useState(batch.dueDateOverride?.slice(0, 10) ?? "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setStage(batch.stage);
      setMedium(batch.medium ?? "");
      setContainerType(batch.containerType ?? "");
      setLocation(batch.location);
      setTransferDate(batch.transferDate.slice(0, 10));
      setNotes(batch.notes ?? "");
      setDueDateOverride(batch.dueDateOverride?.slice(0, 10) ?? "");
    }
  }, [open, batch]);

  const { data: stageOptions } = useOptions("stage");
  const { data: mediaOptions } = useOptions("media");
  const { data: containerOptions } = useOptions("container");
  const { data: locationOptions } = useOptions("location");

  const update = useMutation({
    mutationFn: () =>
      apiFetch(`/api/batches/${batch.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          stage,
          medium: medium || null,
          containerType: containerType || null,
          location,
          transferDate,
          notes: notes || null,
          dueDateOverride: dueDateOverride || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batch", batch.id] });
      queryClient.invalidateQueries({ queryKey: ["batch-timeline", batch.id] });
      queryClient.invalidateQueries({ queryKey: ["samples"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Batch updated" });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ title: "Could not update batch", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    },
  });

  const canSubmit = stage.length > 0 && location.length > 0 && transferDate.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit batch</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) update.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger data-testid="select-edit-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(stageOptions ?? []).map((o: { id: number; label: string }) => (
                    <SelectItem key={o.id} value={o.label} className="capitalize">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transfer date</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} required data-testid="input-edit-transfer-date" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Medium</Label>
              <Select value={medium} onValueChange={setMedium}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
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
              <Label>Container type</Label>
              <Select value={containerType} onValueChange={setContainerType}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
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

          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger data-testid="select-edit-location">
                <SelectValue />
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
            <Label>Due date override (optional)</Label>
            <Input
              type="date"
              value={dueDateOverride}
              onChange={(e) => setDueDateOverride(e.target.value)}
              data-testid="input-edit-due-date-override"
            />
            <p className="text-xs text-muted-foreground">Leave blank to use the computed default. Explain why in Notes if overriding.</p>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} data-testid="textarea-edit-notes" />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!canSubmit || update.isPending} data-testid="button-submit-batch-edit">
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
