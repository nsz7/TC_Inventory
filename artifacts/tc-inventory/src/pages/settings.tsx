import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/hooks/use-auth";
import { useOptions, useAddOption, useSetOptionActive, type LookupOption } from "@/hooks/use-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Settings2, Loader2, ChevronRight, RotateCcw } from "lucide-react";

const LIST_CATEGORIES: { category: string; label: string; description: string }[] = [
  { category: "stage", label: "Culture Stages", description: "Used in the Stage field when creating or transferring batches." },
  { category: "media", label: "Media Types", description: "Used in the Medium field for batches." },
  { category: "container", label: "Container Types", description: "Used in the Container Type field for batches." },
  { category: "location", label: "Locations", description: "Shelf/growth-room/freezer locations used across the app." },
  { category: "discard_reason", label: "Discard Reasons", description: "Shown when discarding containers, or decreasing a Vessels count in the samples table's Edit view." },
  { category: "correction_reason", label: "Correction Reasons", description: "A separate list from discard reasons — shown when increasing a Vessels count in the Edit view (a miscount or previously-unrecorded correction, not a loss)." },
  { category: "archive_reason", label: "Archive Reasons", description: "Shown when archiving a whole sample." },
  { category: "category_code", label: "Category Codes", description: "The two-letter prefix used when creating a new sample." },
];

function OptionList({ category }: { category: string }) {
  const { data: options, isLoading } = useOptions(category, true);
  const addOption = useAddOption(category);
  const setActive = useSetOptionActive(category);
  const { toast } = useToast();
  const [newLabel, setNewLabel] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    if (options?.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
      toast({ title: "Already exists", description: `"${label}" is already in the list.`, variant: "destructive" });
      return;
    }
    addOption.mutate(label, {
      onSuccess: () => {
        setNewLabel("");
        toast({ title: "Added", description: `"${label}" added to the list.` });
      },
      onError: () => toast({ title: "Error", description: "Could not add item.", variant: "destructive" }),
    });
  }

  function handleToggle(opt: LookupOption) {
    setActive.mutate(
      { id: opt.id, active: !opt.active },
      {
        onSuccess: () =>
          toast({ title: opt.active ? "Deactivated" : "Reactivated", description: `"${opt.label}" ${opt.active ? "removed from" : "restored to"} dropdowns.` }),
        onError: () => toast({ title: "Error", description: "Could not update item.", variant: "destructive" }),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          placeholder="Add new option…"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" size="sm" disabled={addOption.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </form>

      <div className="border rounded-lg divide-y">
        {options && options.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">No options yet.</p>
        )}
        {options?.map((opt) => (
          <div key={opt.id} className="flex items-center justify-between px-4 py-2.5">
            <span className={`text-sm ${opt.active ? "" : "text-muted-foreground line-through"}`}>{opt.label}</span>
            <div className="flex items-center gap-2">
              {!opt.active && <Badge variant="secondary">Inactive</Badge>}
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-2 ${opt.active ? "text-destructive hover:text-destructive hover:bg-destructive/10" : ""}`}
                onClick={() => handleToggle(opt)}
                disabled={setActive.isPending}
                title={opt.active ? "Deactivate" : "Reactivate"}
              >
                {opt.active ? <Trash2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Deactivating removes an option from dropdowns everywhere else in the app — it still displays correctly on existing
        records, and can be reactivated here at any time. Nothing is ever deleted.
      </p>
    </div>
  );
}

interface Variety {
  id: number;
  label: string;
  active: boolean;
}

interface Strain {
  id: number;
  varietyId: number;
  label: string;
  active: boolean;
  minStorageStockOverride: number | null;
  storageRenewalIntervalMonthsOverride: number | null;
}

function OverrideInput({
  value,
  globalDefault,
  onSave,
  testId,
}: {
  value: number | null;
  globalDefault: number;
  onSave: (value: number | null) => void;
  testId?: string;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  function commit() {
    if (draft.trim() === "") {
      onSave(null);
      return;
    }
    const parsed = Number(draft);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setDraft(value === null ? "" : String(value));
      return;
    }
    onSave(parsed);
  }

  return (
    <Input
      type="number"
      min={0}
      className="w-24 h-8"
      placeholder={String(globalDefault)}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      data-testid={testId}
    />
  );
}

function StrainRow({ strain, globalMinStock, globalRenewalMonths }: { strain: Strain; globalMinStock: number; globalRenewalMonths: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const update = useMutation({
    mutationFn: (body: Partial<Pick<Strain, "minStorageStockOverride" | "storageRenewalIntervalMonthsOverride" | "active">>) =>
      apiFetch(`/api/strains/${strain.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strains"] });
      queryClient.invalidateQueries({ queryKey: ["varieties-summary"] });
    },
    onError: () => toast({ title: "Error", description: "Could not update strain.", variant: "destructive" }),
  });

  return (
    <div className="flex items-center justify-between gap-4 pl-8 py-2 border-b last:border-0" data-testid={`settings-strain-row-${strain.id}`}>
      <span className={`text-sm ${strain.active ? "" : "text-muted-foreground line-through"}`}>{strain.label}</span>
      <div className="flex items-center gap-4">
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Min storage stock</p>
          <OverrideInput
            value={strain.minStorageStockOverride}
            globalDefault={globalMinStock}
            onSave={(v) => update.mutate({ minStorageStockOverride: v })}
            testId={`input-min-stock-override-${strain.id}`}
          />
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Renewal months</p>
          <OverrideInput
            value={strain.storageRenewalIntervalMonthsOverride}
            globalDefault={globalRenewalMonths}
            onSave={(v) => update.mutate({ storageRenewalIntervalMonthsOverride: v })}
            testId={`input-renewal-override-${strain.id}`}
          />
        </div>
        {!strain.active && <Badge variant="secondary">Inactive</Badge>}
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 ${strain.active ? "text-destructive hover:text-destructive hover:bg-destructive/10" : ""}`}
          onClick={() => update.mutate({ active: !strain.active })}
          title={strain.active ? "Deactivate" : "Reactivate"}
        >
          {strain.active ? <Trash2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function VarietyRow({ variety, globalMinStock, globalRenewalMonths }: { variety: Variety; globalMinStock: number; globalRenewalMonths: number }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newStrainLabel, setNewStrainLabel] = useState("");

  const { data: strains, isLoading } = useQuery({
    queryKey: ["strains", variety.id, { includeInactive: true }],
    queryFn: () => apiFetch<Strain[]>(`/api/strains?varietyId=${variety.id}&includeInactive=true`),
    enabled: expanded,
  });

  const updateVariety = useMutation({
    mutationFn: (body: Partial<Pick<Variety, "active">>) => apiFetch(`/api/varieties/${variety.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["varieties"] }),
    onError: () => toast({ title: "Error", description: "Could not update variety.", variant: "destructive" }),
  });

  const addStrain = useMutation({
    mutationFn: (label: string) => apiFetch("/api/strains", { method: "POST", body: JSON.stringify({ varietyId: variety.id, label }) }),
    onSuccess: () => {
      setNewStrainLabel("");
      queryClient.invalidateQueries({ queryKey: ["strains", variety.id] });
    },
    onError: () => toast({ title: "Error", description: "Could not add strain.", variant: "destructive" }),
  });

  return (
    <div className="border-b last:border-0" data-testid={`settings-variety-row-${variety.id}`}>
      <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/50" onClick={() => setExpanded((v) => !v)}>
        <span className="text-sm font-medium inline-flex items-center gap-1.5">
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
          <span className={variety.active ? "" : "text-muted-foreground line-through"}>{variety.label}</span>
        </span>
        <div className="flex items-center gap-2">
          {!variety.active && <Badge variant="secondary">Inactive</Badge>}
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2 ${variety.active ? "text-destructive hover:text-destructive hover:bg-destructive/10" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              updateVariety.mutate({ active: !variety.active });
            }}
            title={variety.active ? "Deactivate" : "Reactivate"}
          >
            {variety.active ? <Trash2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="pb-3 bg-muted/20">
          {isLoading ? (
            <p className="pl-8 py-2 text-sm text-muted-foreground">Loading…</p>
          ) : (
            strains?.map((s) => <StrainRow key={s.id} strain={s} globalMinStock={globalMinStock} globalRenewalMonths={globalRenewalMonths} />)
          )}
          <form
            className="flex gap-2 pl-8 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              const label = newStrainLabel.trim();
              if (label) addStrain.mutate(label);
            }}
          >
            <Input
              placeholder="Add strain…"
              value={newStrainLabel}
              onChange={(e) => setNewStrainLabel(e.target.value)}
              className="max-w-xs h-8"
            />
            <Button type="submit" size="sm" variant="outline" disabled={addStrain.isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add strain
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function VarietiesStrainsSection({ globalMinStock, globalRenewalMonths }: { globalMinStock: number; globalRenewalMonths: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newVarietyLabel, setNewVarietyLabel] = useState("");

  const { data: varieties, isLoading } = useQuery({
    queryKey: ["varieties", { includeInactive: true }],
    queryFn: () => apiFetch<Variety[]>("/api/varieties?includeInactive=true"),
  });

  const addVariety = useMutation({
    mutationFn: (label: string) => apiFetch("/api/varieties", { method: "POST", body: JSON.stringify({ label }) }),
    onSuccess: () => {
      setNewVarietyLabel("");
      queryClient.invalidateQueries({ queryKey: ["varieties"] });
    },
    onError: () => toast({ title: "Error", description: "Could not add variety.", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Every variety needs at least one strain — new samples can't be created against a variety with no strains. Each
        strain's minimum storage stock and renewal interval follow the global defaults unless overridden here.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const label = newVarietyLabel.trim();
          if (label) addVariety.mutate(label);
        }}
      >
        <Input placeholder="Add new variety…" value={newVarietyLabel} onChange={(e) => setNewVarietyLabel(e.target.value)} className="max-w-xs" />
        <Button type="submit" size="sm" disabled={addVariety.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </form>
      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : varieties?.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No varieties yet.</p>
        ) : (
          varieties?.map((v) => <VarietyRow key={v.id} variety={v} globalMinStock={globalMinStock} globalRenewalMonths={globalRenewalMonths} />)
        )}
      </div>
    </div>
  );
}

interface AppSettings {
  defaultMinStorageStock: number;
  defaultStorageRenewalIntervalMonths: number;
}

interface StageInterval {
  stage: string;
  intervalDays: number | null;
  isPlaceholder: boolean;
}

function GlobalDefaultsCard({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [minStock, setMinStock] = useState(String(settings.defaultMinStorageStock));
  const [renewalMonths, setRenewalMonths] = useState(String(settings.defaultStorageRenewalIntervalMonths));

  const update = useMutation({
    mutationFn: (body: Partial<AppSettings>) => apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["varieties-summary"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Error", description: "Could not save.", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Global defaults</CardTitle>
        <CardDescription>Applied to every strain that doesn't override them.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 max-w-md">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">Minimum storage stock</label>
          <Input
            type="number"
            min={0}
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            onBlur={() => {
              const parsed = Number(minStock);
              if (Number.isInteger(parsed) && parsed >= 0 && parsed !== settings.defaultMinStorageStock) {
                update.mutate({ defaultMinStorageStock: parsed });
              } else {
                setMinStock(String(settings.defaultMinStorageStock));
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">Storage renewal (months)</label>
          <Input
            type="number"
            min={1}
            value={renewalMonths}
            onChange={(e) => setRenewalMonths(e.target.value)}
            onBlur={() => {
              const parsed = Number(renewalMonths);
              if (Number.isInteger(parsed) && parsed > 0 && parsed !== settings.defaultStorageRenewalIntervalMonths) {
                update.mutate({ defaultStorageRenewalIntervalMonths: parsed });
              } else {
                setRenewalMonths(String(settings.defaultStorageRenewalIntervalMonths));
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StageIntervalsCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: intervals, isLoading } = useQuery({
    queryKey: ["stage-intervals"],
    queryFn: () => apiFetch<StageInterval[]>("/api/stage-intervals"),
  });

  const update = useMutation({
    mutationFn: ({ stage, intervalDays }: { stage: string; intervalDays: number }) =>
      apiFetch(`/api/stage-intervals/${encodeURIComponent(stage)}`, { method: "PATCH", body: JSON.stringify({ intervalDays }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stage-intervals"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Error", description: "Could not save.", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Subculture interval per stage (days)</CardTitle>
        <CardDescription>
          Used to compute each batch's due date for every stage except long-term storage, which uses the renewal-months
          setting above instead. <strong>Placeholder values are invented, not real lab intervals</strong> — review and set
          the real number for each stage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-2 max-w-md">
            {intervals?.map((interval) => (
              <StageIntervalRow key={interval.stage} interval={interval} onSave={(days) => update.mutate({ stage: interval.stage, intervalDays: days })} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StageIntervalRow({ interval, onSave }: { interval: StageInterval; onSave: (days: number) => void }) {
  const [draft, setDraft] = useState(interval.intervalDays === null ? "" : String(interval.intervalDays));

  function commit() {
    const parsed = Number(draft);
    if (Number.isInteger(parsed) && parsed > 0 && parsed !== interval.intervalDays) {
      onSave(parsed);
    } else {
      setDraft(interval.intervalDays === null ? "" : String(interval.intervalDays));
    }
  }

  return (
    <div className="flex items-center justify-between gap-3" data-testid={`stage-interval-row-${interval.stage}`}>
      <span className="text-sm capitalize">{interval.stage}</span>
      <div className="flex items-center gap-2">
        {interval.isPlaceholder && (
          <Badge variant="outline" className="text-amber-700 border-amber-500 dark:text-amber-400" data-testid={`badge-placeholder-${interval.stage}`}>
            Placeholder
          </Badge>
        )}
        <Input
          type="number"
          min={1}
          className="w-24 h-8"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          data-testid={`input-stage-interval-${interval.stage}`}
        />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<AppSettings>("/api/settings"),
    enabled: currentUser?.role === "admin",
  });

  if (userLoading) return null;
  if (currentUser?.role !== "admin") {
    return <p className="text-muted-foreground p-8">Admin access required.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="h-6 w-6" /> Settings
        </h1>
        <p className="text-muted-foreground mt-1">Manage lists, varieties/strains, and numeric defaults used across the app.</p>
      </div>

      <Tabs defaultValue={LIST_CATEGORIES[0].category}>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Managed lists</h2>
          <TabsList className="flex-wrap h-auto">
            {LIST_CATEGORIES.map((c) => (
              <TabsTrigger key={c.category} value={c.category}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {LIST_CATEGORIES.map((c) => (
          <TabsContent key={c.category} value={c.category} className="mt-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">{c.description}</p>
              <OptionList category={c.category} />
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Varieties &amp; strains</h2>
        <Card>
          <CardContent className="pt-6">
            {settingsLoading || !settings ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <VarietiesStrainsSection globalMinStock={settings.defaultMinStorageStock} globalRenewalMonths={settings.defaultStorageRenewalIntervalMonths} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Numeric defaults</h2>
        {settingsLoading || !settings ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <GlobalDefaultsCard settings={settings} />
            <StageIntervalsCard />
          </div>
        )}
      </div>
    </div>
  );
}
