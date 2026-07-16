import { useState } from "react";
import { useOptions, useAddOption, useDeleteOption } from "@/hooks/use-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Settings2, Loader2 } from "lucide-react";

function OptionList({ category }: { category: string }) {
  const { data: options, isLoading } = useOptions(category);
  const addOption = useAddOption(category);
  const deleteOption = useDeleteOption(category);
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

  function handleDelete(id: number, label: string) {
    deleteOption.mutate(id, {
      onSuccess: () => toast({ title: "Removed", description: `"${label}" removed.` }),
      onError: () => toast({ title: "Error", description: "Could not remove item.", variant: "destructive" }),
    });
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
            <span className="text-sm capitalize">{opt.label}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDelete(opt.id, opt.label)}
              disabled={deleteOption.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Changes apply immediately to all dropdown menus in the app.
      </p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="h-6 w-6" /> Settings
        </h1>
        <p className="text-muted-foreground mt-1">Manage dropdown list options used across the app.</p>
      </div>

      <Tabs defaultValue="stage">
        <TabsList>
          <TabsTrigger value="stage">Stages</TabsTrigger>
          <TabsTrigger value="media">Media Types</TabsTrigger>
          <TabsTrigger value="container">Container Types</TabsTrigger>
        </TabsList>

        <TabsContent value="stage" className="mt-4">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Culture Stages</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Used in the Stage field when creating or subculturing samples.
              Note: <strong>revitalization</strong> uses the same sub-code prefix as rooting (r1, r2…).
            </p>
            <OptionList category="stage" />
          </div>
        </TabsContent>

        <TabsContent value="media" className="mt-4">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Media Types</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Used in the Media Type field when creating or subculturing samples.
            </p>
            <OptionList category="media" />
          </div>
        </TabsContent>

        <TabsContent value="container" className="mt-4">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Container Types</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Used in the Container Type field when creating or subculturing samples.
            </p>
            <OptionList category="container" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
