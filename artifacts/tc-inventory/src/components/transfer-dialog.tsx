import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useOptions } from "@/hooks/use-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Matches the discard_reason option added for this flow — pre-filled so
// closing out the source never starts from a blank, unexplained reason.
const DEFAULT_CLOSE_OUT_REASON = "fully transferred — source retired";

interface OutputRow {
  key: string;
  producedQuantity: string;
  stage: string;
  medium: string;
  containerType: string;
  location: string;
  notes: string;
  appearedCleanAtTransfer: boolean;
  isRescue: boolean;
}

function newRow(defaults: Partial<OutputRow> = {}): OutputRow {
  return {
    key: Math.random().toString(36).slice(2),
    producedQuantity: "",
    stage: "",
    medium: "",
    containerType: "",
    location: "",
    notes: "",
    appearedCleanAtTransfer: true,
    isRescue: false,
    ...defaults,
  };
}

interface TransferDialogProps {
  batchId: number;
  sourceSubcode: string;
  sourceHasAlert: boolean;
  maxQuantity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferDialog({ batchId, sourceSubcode, sourceHasAlert, maxQuantity, open, onOpenChange }: TransferDialogProps) {
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<OutputRow[]>([newRow()]);
  // Operation-level and blank by default: taking tissue from a container
  // doesn't destroy it, so the lab normally keeps every container back and
  // nothing is consumed. A number here means that many were used up across
  // the whole transfer, not per output row.
  const [consumedQuantity, setConsumedQuantity] = useState("");
  const [closeOutSource, setCloseOutSource] = useState(false);
  const [closeOutReason, setCloseOutReason] = useState(DEFAULT_CLOSE_OUT_REASON);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stageOptions } = useOptions("stage");
  const { data: mediaOptions } = useOptions("media");
  const { data: containerOptions } = useOptions("container");
  const { data: locationOptions } = useOptions("location");
  const { data: discardReasonOptions } = useOptions("discard_reason");

  const consumed = consumedQuantity === "" ? 0 : Number(consumedQuantity);
  const remainderAfterConsumption = maxQuantity - consumed;

  const errors: string[] = [];
  if (!transferDate) errors.push("Transfer date is required.");
  rows.forEach((r, idx) => {
    if (!(Number(r.producedQuantity) > 0)) errors.push(`Output ${idx + 1} needs a positive number of containers created.`);
    if (!r.stage) errors.push(`Output ${idx + 1} needs a stage.`);
    if (!r.location) errors.push(`Output ${idx + 1} needs a location.`);
  });
  if (consumedQuantity !== "" && (!Number.isInteger(consumed) || consumed < 0)) {
    errors.push("Containers used up must be zero or a positive whole number.");
  } else if (consumed > maxQuantity) {
    errors.push(`Cannot use up ${consumed} containers — only ${maxQuantity} available in this batch.`);
  }
  if (closeOutSource) {
    if (remainderAfterConsumption <= 0) errors.push("There would be nothing left in the source batch to close out.");
    if (!closeOutReason) errors.push("Choose a reason for closing out the source.");
  }

  const canSubmit = errors.length === 0;

  const transfer = useMutation({
    mutationFn: () =>
      apiFetch(`/api/batches/${batchId}/subculture`, {
        method: "POST",
        body: JSON.stringify({
          transferDate,
          outputs: rows.map((r) => ({
            producedQuantity: Number(r.producedQuantity),
            stage: r.stage,
            medium: r.medium || undefined,
            containerType: r.containerType || undefined,
            location: r.location,
            notes: r.notes || undefined,
            appearedCleanAtTransfer: r.isRescue ? undefined : r.appearedCleanAtTransfer,
            isRescue: r.isRescue || undefined,
          })),
          consumedQuantity: consumedQuantity === "" ? undefined : consumed,
          closeOutSource: closeOutSource ? { reason: closeOutReason } : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batch", batchId] });
      queryClient.invalidateQueries({ queryKey: ["batch-timeline", batchId] });
      queryClient.invalidateQueries({ queryKey: ["batch-ancestors", batchId] });
      queryClient.invalidateQueries({ queryKey: ["batch-lineage-tree", batchId] });
      queryClient.invalidateQueries({ queryKey: ["samples"] });
      queryClient.invalidateQueries({ queryKey: ["sample-batches"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Transfer recorded" });
      setRows([newRow()]);
      setConsumedQuantity("");
      setCloseOutSource(false);
      setCloseOutReason(DEFAULT_CLOSE_OUT_REASON);
      setSubmitAttempted(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ title: "Could not record transfer", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    },
  });

  function updateRow(key: string, patch: Partial<OutputRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer from {sourceSubcode}</DialogTitle>
          <DialogDescription>
            {maxQuantity} container{maxQuantity === 1 ? "" : "s"} available. Containers are kept back by default — only
            fill in "containers used up" if some were actually consumed.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitAttempted(true);
            if (canSubmit) transfer.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="transfer-date">Transfer date</Label>
              <Input
                id="transfer-date"
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consumed-quantity">Containers used up (optional)</Label>
              <Input
                id="consumed-quantity"
                type="number"
                min={0}
                placeholder="Blank — none used"
                value={consumedQuantity}
                onChange={(e) => setConsumedQuantity(e.target.value)}
                data-testid="input-consumed-quantity"
              />
            </div>
          </div>

          <div className="space-y-4">
            {rows.map((row, idx) => (
              <div key={row.key} className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Output {idx + 1}</span>
                  {rows.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.key)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>New containers created</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.producedQuantity}
                      onChange={(e) => updateRow(row.key, { producedQuantity: e.target.value })}
                      data-testid={`input-produced-${idx}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stage</Label>
                    <Select value={row.stage} onValueChange={(v) => updateRow(row.key, { stage: v })}>
                      <SelectTrigger data-testid={`select-stage-${idx}`}>
                        <SelectValue placeholder="Select stage" />
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
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Location</Label>
                    <Select value={row.location} onValueChange={(v) => updateRow(row.key, { location: v })}>
                      <SelectTrigger data-testid={`select-location-${idx}`}>
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
                  <div className="space-y-1.5">
                    <Label>Medium (optional)</Label>
                    <Select value={row.medium} onValueChange={(v) => updateRow(row.key, { medium: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Same as source" />
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
                </div>

                <div className="space-y-1.5">
                  <Label>Container type (optional)</Label>
                  <Select value={row.containerType} onValueChange={(v) => updateRow(row.key, { containerType: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Same as source" />
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

                {/* Rescue toggle is mutually exclusive with the clean-at-transfer
                    checkbox: rescue forces the alert state unconditionally, so
                    there's nothing for that checkbox to mean once it's checked. */}
                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={row.isRescue}
                      onCheckedChange={(v) => updateRow(row.key, { isRescue: !!v })}
                      data-testid={`checkbox-rescue-${idx}`}
                    />
                    <span className="text-sm">This material showed contamination — rescue instead of a normal transfer</span>
                  </label>
                  {row.isRescue ? (
                    <p className="text-xs text-muted-foreground pl-6">
                      This will mark {sourceSubcode} as having shown contamination, and the resulting batch will carry a
                      contamination alert until it clears.
                    </p>
                  ) : (
                    sourceHasAlert && (
                      <label className="flex items-center gap-2 cursor-pointer select-none pl-6">
                        <Checkbox
                          checked={row.appearedCleanAtTransfer}
                          onCheckedChange={(v) => updateRow(row.key, { appearedCleanAtTransfer: !!v })}
                          data-testid={`checkbox-clean-${idx}`}
                        />
                        <span className="text-sm">Source appeared clean at transfer</span>
                      </label>
                    )
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={row.notes}
                    onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, newRow()])}>
            <Plus className="mr-2 h-4 w-4" />
            Add another output
          </Button>

          <Separator />

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={closeOutSource}
                onCheckedChange={(v) => setCloseOutSource(!!v)}
                data-testid="checkbox-close-out-source"
              />
              <span className="text-sm">
                Close out {sourceSubcode} — discard the {Math.max(remainderAfterConsumption, 0)} remaining container
                {remainderAfterConsumption === 1 ? "" : "s"}
              </span>
            </label>
            {closeOutSource && (
              <div className="pl-6 space-y-1.5">
                <Label>Reason</Label>
                <Select value={closeOutReason} onValueChange={setCloseOutReason}>
                  <SelectTrigger className="w-64" data-testid="select-close-out-reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {(discardReasonOptions ?? []).map((o: { id: number; label: string }) => (
                      <SelectItem key={o.id} value={o.label}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {submitAttempted && errors.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <ul className="text-sm text-destructive space-y-0.5" data-testid="transfer-validation-errors">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={transfer.isPending} data-testid="button-submit-transfer">
              {transfer.isPending ? "Recording…" : "Record transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
