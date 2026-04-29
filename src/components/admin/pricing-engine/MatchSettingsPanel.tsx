import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Save, RotateCcw, X, Plus, Sliders } from "lucide-react";
import {
  peGetMatchSettings,
  peSaveMatchSettings,
} from "@/lib/server-fns/pricing-engine.functions";

type Settings = {
  link_threshold: number;
  auto_merge_threshold: number;
  ignore_tokens: string[];
  require_unit_match: boolean;
  use_ai_default: boolean;
};

const FACTORY_DEFAULTS: Settings = {
  link_threshold: 0.7,
  auto_merge_threshold: 0.85,
  ignore_tokens: ["fresh","raw","whole","large","small","medium","organic","the","a","an","chopped","minced","diced","sliced","grated","ground"],
  require_unit_match: true,
  use_ai_default: true,
};

export function MatchSettingsPanel() {
  const getFn = useServerFn(peGetMatchSettings);
  const saveFn = useServerFn(peSaveMatchSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<Settings>(FACTORY_DEFAULTS);
  const [tokenInput, setTokenInput] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await getFn();
      const row = r.settings as any;
      setS({
        link_threshold: Number(row.link_threshold),
        auto_merge_threshold: Number(row.auto_merge_threshold),
        ignore_tokens: row.ignore_tokens ?? [],
        require_unit_match: !!row.require_unit_match,
        use_ai_default: !!row.use_ai_default,
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (s.auto_merge_threshold < s.link_threshold) {
      toast.error("Auto-merge threshold must be ≥ link threshold");
      return;
    }
    setSaving(true);
    try {
      await saveFn({ data: s });
      toast.success("Match settings saved");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const addTokens = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((t) => t.toLowerCase().trim()).filter(Boolean);
    if (parts.length === 0) return;
    setS((prev) => ({
      ...prev,
      ignore_tokens: Array.from(new Set([...prev.ignore_tokens, ...parts])),
    }));
    setTokenInput("");
  };

  const removeToken = (tok: string) => {
    setS((prev) => ({
      ...prev,
      ignore_tokens: prev.ignore_tokens.filter((t) => t !== tok),
    }));
  };

  if (loading) {
    return <Card><CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
    </CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-primary" />
          Match Settings
        </CardTitle>
        <CardDescription>
          Configure how the duplicate-finder links and merges ingredients.
          These settings apply every time you scan from the <strong>Auto-match &amp; Clean</strong> tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Thresholds */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>
              Link threshold:{" "}
              <span className="font-mono font-semibold">{Math.round(s.link_threshold * 100)}%</span>
            </Label>
            <Slider
              value={[s.link_threshold]}
              min={0.5} max={1} step={0.01}
              onValueChange={(v) => setS({ ...s, link_threshold: v[0] })}
            />
            <p className="text-xs text-muted-foreground">
              Minimum confidence for two ingredients to be considered a possible duplicate
              (lower = more candidates, more noise).
            </p>
          </div>
          <div className="space-y-2">
            <Label>
              Auto-merge threshold:{" "}
              <span className="font-mono font-semibold">{Math.round(s.auto_merge_threshold * 100)}%</span>
            </Label>
            <Slider
              value={[s.auto_merge_threshold]}
              min={0.5} max={1} step={0.01}
              onValueChange={(v) => setS({ ...s, auto_merge_threshold: v[0] })}
            />
            <p className="text-xs text-muted-foreground">
              Confidence at which a group is safe to merge automatically.
              Must be ≥ link threshold.
            </p>
          </div>
        </div>

        {/* Toggles */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Switch
              id="require-unit"
              checked={s.require_unit_match}
              onCheckedChange={(v) => setS({ ...s, require_unit_match: v })}
            />
            <div className="space-y-0.5">
              <Label htmlFor="require-unit" className="cursor-pointer">Match by unit</Label>
              <p className="text-xs text-muted-foreground">
                Only consider duplicates that share the same base unit
                (e.g. <em>lb</em> ≠ <em>cup</em>). Turning this off allows cross-unit candidates.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Switch
              id="use-ai-default"
              checked={s.use_ai_default}
              onCheckedChange={(v) => setS({ ...s, use_ai_default: v })}
            />
            <div className="space-y-0.5">
              <Label htmlFor="use-ai-default" className="cursor-pointer">Use AI by default</Label>
              <p className="text-xs text-muted-foreground">
                When on, ambiguous fuzzy matches are also rated by Lovable AI during a scan.
              </p>
            </div>
          </div>
        </div>

        {/* Ignore tokens */}
        <div className="space-y-3">
          <div>
            <Label>Ignore tokens</Label>
            <p className="text-xs text-muted-foreground">
              These words are stripped from ingredient names before matching, so e.g.{" "}
              <em>"fresh chopped tomato"</em> and <em>"tomato"</em> compare as the same root.
              Add words separated by commas or newlines.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[2rem] rounded-md border p-2 bg-muted/30">
            {s.ignore_tokens.length === 0 && (
              <span className="text-xs text-muted-foreground italic">No tokens — names match as-is.</span>
            )}
            {s.ignore_tokens.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button
                  type="button"
                  onClick={() => removeToken(t)}
                  className="hover:text-destructive"
                  aria-label={`Remove ${t}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. chopped, fresh, organic"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTokens(tokenInput);
                }
              }}
            />
            <Button type="button" variant="outline" onClick={() => addTokens(tokenInput)}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 justify-end pt-2 border-t">
          <Button
            variant="ghost"
            onClick={() => setS(FACTORY_DEFAULTS)}
            disabled={saving}
          >
            <RotateCcw className="w-4 h-4 mr-1" /> Reset to defaults
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
