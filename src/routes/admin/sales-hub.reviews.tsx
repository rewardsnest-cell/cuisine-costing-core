import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Lock, Star, Gift } from "lucide-react";
import { REVIEW_SCRIPTS, REVIEW_RULES, REFERRAL_ASK } from "@/lib/sales-hub/scripts";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin/sales-hub/reviews")({
  component: ReviewsPage,
});

const KV_KEY = "google_review_link";

function ReviewsPage() {
  const { user } = useAuth();
  const [link, setLink] = useState("");
  const [savedLink, setSavedLink] = useState("");
  const [asks, setAsks] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("text");

  const load = async () => {
    const [kv, list] = await Promise.all([
      (supabase as any).from("app_kv").select("value").eq("key", KV_KEY).maybeSingle(),
      (supabase as any).from("sales_review_asks").select("*").order("asked_at", { ascending: false }).limit(25),
    ]);
    const v = kv?.data?.value || "";
    setLink(v); setSavedLink(v);
    setAsks(list?.data || []);
  };
  useEffect(() => { load(); }, []);

  const saveLink = async () => {
    const { error } = await (supabase as any).from("app_kv").upsert({ key: KV_KEY, value: link, updated_by: user?.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return toast.error(error.message);
    setSavedLink(link);
    toast.success("Review link saved");
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Couldn't copy"); }
  };

  const logAsk = async () => {
    if (!name.trim()) { toast.error("Client name required"); return; }
    const { error } = await (supabase as any).from("sales_review_asks").insert({ client_name: name, channel, asked_by: user?.id });
    if (error) return toast.error(error.message);
    setName("");
    toast.success("Logged");
    load();
  };

  const markReceived = async (id: string, val: boolean) => {
    const { error } = await (supabase as any).from("sales_review_asks").update({ review_received: val }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const scripts = [
    { id: "in-person", title: "In-Person Ask", body: REVIEW_SCRIPTS.inPerson(savedLink) },
    { id: "text", title: "Text Request", body: REVIEW_SCRIPTS.text(savedLink) },
    { id: "email", title: "Email Request", body: REVIEW_SCRIPTS.email(savedLink) },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">Google Review Link</h2>
          <div className="flex gap-2">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://g.page/r/..." />
            <Button onClick={saveLink}>Save</Button>
          </div>
          <p className="text-xs text-muted-foreground">This link is auto-inserted into the scripts below.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold mb-2">Rules</h3>
          <ul className="space-y-1.5 text-sm">
            {REVIEW_RULES.map((r) => <li key={r} className="flex gap-2"><span className="text-primary">•</span>{r}</li>)}
          </ul>
        </CardContent>
      </Card>

      {scripts.map((s) => (
        <Card key={s.id}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display font-semibold">{s.title}</h3>
              <Button size="sm" variant="outline" onClick={() => copy(s.body)} className="gap-1.5"><Copy className="w-4 h-4" />Copy</Button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/40 border rounded p-4">{s.body}</pre>
            <Badge variant="outline" className="gap-1"><Lock className="w-3 h-3" />Locked</Badge>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">Log a review ask</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2"><Label>Client name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-person">In-person</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={logAsk}>Log ask</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-semibold mb-3">Recent asks</h2>
          {asks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No review asks logged yet.</p>
          ) : (
            <ul className="divide-y">
              {asks.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-medium">{a.client_name}</p>
                    <p className="text-xs text-muted-foreground">{a.channel} · {new Date(a.asked_at).toLocaleDateString()}</p>
                  </div>
                  <label className="text-xs flex items-center gap-2">
                    <Checkbox checked={a.review_received} onCheckedChange={(v) => markReceived(a.id, !!v)} />
                    <span className="flex items-center gap-1">{a.review_received && <Star className="w-3 h-3 text-warning" />}Received</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
