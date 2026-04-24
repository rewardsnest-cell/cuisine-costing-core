import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { FlaskConical, Plus, Trash2, Archive, Play, Eye } from "lucide-react";

export const Route = createFileRoute("/admin/pricing-lab")({
  head: () => ({
    meta: [{ title: "Pricing Lab — Admin" }],
  }),
  component: PricingLabPage,
});

type PricingModel = {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  notes: string | null;
  activated_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type CateringRecipe = {
  id: string;
  name: string;
  cost_per_serving: number | null;
};

type PricingModelRecipe = {
  id: string;
  pricing_model_id: string;
  recipe_id: string;
  price_per_person: number;
  notes: string | null;
};

function PricingLabPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const { data: models = [], isLoading } = useQuery({
    queryKey: ["pricing-models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_models")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PricingModel[];
    },
  });

  const selected = models.find((m) => m.id === selectedId) ?? models[0] ?? null;

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("pricing_models")
        .insert({ name: newName.trim(), notes: newNotes.trim() || null })
        .select()
        .single();
      if (error) throw error;
      return data as PricingModel;
    },
    onSuccess: (m) => {
      toast.success("Pricing model created");
      setCreateOpen(false);
      setNewName("");
      setNewNotes("");
      setSelectedId(m.id);
      qc.invalidateQueries({ queryKey: ["pricing-models"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PricingModel["status"] }) => {
      // If activating, deactivate all others first
      if (status === "active") {
        await supabase
          .from("pricing_models")
          .update({ status: "draft" as const })
          .eq("status", "active")
          .neq("id", id);
      }
      const { error } = await supabase.from("pricing_models").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["pricing-models"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_models").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pricing model deleted");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["pricing-models"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="w-5 h-5 text-primary" />
            <h2 className="font-display text-2xl font-bold">Pricing Lab</h2>
            <Badge variant="outline" className="ml-2">Internal Sandbox</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Versioned, admin-only pricing models for catering. Models never auto-activate and never affect existing quotes. Activation only applies to <strong>future</strong> quotes.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/pricing-lab/preview">
            <Button variant="outline" className="gap-2">
              <Eye className="w-4 h-4" /> Pricing Preview
            </Button>
          </Link>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New Model</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Pricing Model</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Standard 2026" />
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={!newName.trim() || createMutation.isPending}>
                  Create as Draft
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Models</CardTitle></CardHeader>
          <CardContent className="p-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground p-3">Loading…</p>
            ) : models.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3">No models yet. Create one to get started.</p>
            ) : (
              <div className="space-y-1">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      selected?.id === m.id ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{m.name}</span>
                      <StatusBadge status={m.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Updated {new Date(m.updated_at).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selected ? (
          <ModelDetail
            model={selected}
            onStatusChange={(status) => statusMutation.mutate({ id: selected.id, status })}
            onDelete={() => {
              if (confirm(`Delete pricing model "${selected.name}"? This is reversible only via audit log.`)) {
                deleteMutation.mutate(selected.id);
              }
            }}
          />
        ) : (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            Select a model to view its recipe assignments.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PricingModel["status"] }) {
  if (status === "active") return <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>;
  if (status === "archived") return <Badge variant="secondary">Archived</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

function ModelDetail({
  model,
  onStatusChange,
  onDelete,
}: {
  model: PricingModel;
  onStatusChange: (s: PricingModel["status"]) => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [addRecipeId, setAddRecipeId] = useState<string>("");
  const [addPrice, setAddPrice] = useState<string>("");

  const { data: recipes = [] } = useQuery({
    queryKey: ["catering-internal-recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id,name,cost_per_serving")
        .eq("scope", "catering_internal")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as CateringRecipe[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["pricing-model-recipes", model.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_model_recipes")
        .select("*")
        .eq("pricing_model_id", model.id);
      if (error) throw error;
      return data as PricingModelRecipe[];
    },
  });

  const recipeMap = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.recipe_id)), [assignments]);
  const availableRecipes = recipes.filter((r) => !assignedIds.has(r.id));

  const addMutation = useMutation({
    mutationFn: async () => {
      const price = parseFloat(addPrice);
      if (!addRecipeId || isNaN(price) || price < 0) throw new Error("Pick a recipe and valid price");
      const { error } = await supabase.from("pricing_model_recipes").insert({
        pricing_model_id: model.id,
        recipe_id: addRecipeId,
        price_per_person: price,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recipe added");
      setAddRecipeId("");
      setAddPrice("");
      qc.invalidateQueries({ queryKey: ["pricing-model-recipes", model.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: number }) => {
      const { error } = await supabase
        .from("pricing_model_recipes")
        .update({ price_per_person: price })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-model-recipes", model.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_model_recipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["pricing-model-recipes", model.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                {model.name} <StatusBadge status={model.status} />
              </CardTitle>
              {model.notes && <p className="text-sm text-muted-foreground mt-1">{model.notes}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                Created {new Date(model.created_at).toLocaleString()}
                {model.activated_at && ` · Last activated ${new Date(model.activated_at).toLocaleString()}`}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {model.status !== "active" && (
                <Button size="sm" variant="default" className="gap-1.5" onClick={() => {
                  if (confirm(`Activate "${model.name}"? Active pricing applies to FUTURE quotes only — existing quotes are not affected.`)) {
                    onStatusChange("active");
                  }
                }}>
                  <Play className="w-3.5 h-3.5" /> Activate
                </Button>
              )}
              {model.status === "active" && (
                <Button size="sm" variant="outline" onClick={() => onStatusChange("draft")}>
                  Move to Draft
                </Button>
              )}
              {model.status !== "archived" && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onStatusChange("archived")}>
                  <Archive className="w-3.5 h-3.5" /> Archive
                </Button>
              )}
              {model.status === "archived" && (
                <Button size="sm" variant="outline" onClick={() => onStatusChange("draft")}>Unarchive</Button>
              )}
              <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recipe Pricing ({assignments.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <Label className="text-xs">Add catering recipe</Label>
              <Select value={addRecipeId} onValueChange={setAddRecipeId}>
                <SelectTrigger><SelectValue placeholder="Select a recipe…" /></SelectTrigger>
                <SelectContent>
                  {availableRecipes.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">All available recipes are added.</div>
                  ) : (
                    availableRecipes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <Label className="text-xs">Price / person</Label>
              <Input
                type="number" step="0.01" min="0"
                value={addPrice} onChange={(e) => setAddPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>Add</Button>
          </div>

          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No recipes assigned yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipe</TableHead>
                  <TableHead className="w-32">Cost / person</TableHead>
                  <TableHead className="w-40">Price / person</TableHead>
                  <TableHead className="w-24">Margin</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const recipe = recipeMap.get(a.recipe_id);
                  const cost = recipe?.cost_per_serving ?? 0;
                  const margin = a.price_per_person > 0
                    ? ((a.price_per_person - cost) / a.price_per_person) * 100
                    : 0;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{recipe?.name ?? "(unknown)"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">${cost.toFixed(2)}</TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01" min="0"
                          defaultValue={a.price_per_person}
                          className="h-8 w-28"
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v !== a.price_per_person) {
                              updatePriceMutation.mutate({ id: a.id, price: v });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className={`text-sm ${margin < 50 ? "text-amber-600" : "text-foreground"}`}>
                        {margin.toFixed(0)}%
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => removeMutation.mutate(a.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
