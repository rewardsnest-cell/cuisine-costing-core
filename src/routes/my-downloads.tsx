import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import { Download, Trash2, FileText, ChefHat, Mail, ShoppingCart, FileDown } from "lucide-react";
import { toast } from "sonner";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/my-downloads")({
  head: () => ({
    meta: [
      { title: "My Downloads — VPS Finest" },
      { name: "description", content: "Re-download every recipe card, quote, and report you've generated." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyDownloadsPage,
});

type Row = {
  id: string;
  kind: string;
  filename: string;
  public_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  source_label: string | null;
  source_id: string | null;
  created_at: string;
};

const KIND_META: Record<string, { label: string; icon: any }> = {
  recipe_card:      { label: "Recipe Card",      icon: ChefHat },
  quote_pdf:        { label: "Catering Quote",   icon: FileText },
  newsletter_guide: { label: "Recipe Guide",     icon: Mail },
  shopping_list:    { label: "Shopping List",    icon: ShoppingCart },
  audit_export:     { label: "Audit Export",     icon: FileDown },
  admin_export:     { label: "Admin Export",     icon: FileDown },
  other:            { label: "File",             icon: FileText },
};

function fmtBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function MyDownloadsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/login", search: { redirect: "/my-downloads" } as any }); return; }
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("user_downloads")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) toast.error("Couldn't load downloads", { description: error.message });
      setRows(data || []);
      setLoading(false);
    })();
  }, [user, authLoading, navigate]);

  const onDelete = async (id: string) => {
    if (!confirm("Remove this file from your downloads?")) return;
    const row = rows.find((r) => r.id === id);
    setRows((r) => r.filter((x) => x.id !== id));
    const { error } = await (supabase as any).from("user_downloads").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't remove", { description: error.message });
      return;
    }
    // Best-effort storage cleanup (ignore failures — RLS may still allow)
    if (row && (row as any).storage_path) {
      try { await supabase.storage.from("site-assets").remove([(row as any).storage_path]); } catch { /* ignore */ }
    }
    toast.success("Removed");
  };

  // Group by kind
  const groups = rows.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.kind] ||= []).push(r);
    return acc;
  }, {});

  return (
    <>
      <PublicHeader />
      <main className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="mb-8">
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">My Downloads</h1>
          <p className="text-muted-foreground">
            Every recipe card, quote, and report you've generated — saved to your account so you can re-download anytime.
          </p>
        </div>

        {loading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileDown className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">No downloads yet.</p>
              <div className="flex gap-2 justify-center">
                <Link to="/recipes"><Button variant="outline" size="sm">Browse recipes</Button></Link>
                <Link to="/quote"><Button size="sm">Get a quote</Button></Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groups).map(([kind, items]) => {
              const meta = KIND_META[kind] || KIND_META.other;
              const Icon = meta.icon;
              return (
                <Card key={kind}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Icon className="w-5 h-5 text-primary" />
                      {meta.label}
                      <Badge variant="secondary" className="ml-1">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y">
                      {items.map((r) => (
                        <li key={r.id} className="py-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{r.source_label || r.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleString()} · {fmtBytes(r.size_bytes)}
                            </p>
                          </div>
                          {r.public_url ? (
                            <a href={r.public_url} target="_blank" rel="noopener" download={r.filename}>
                              <Button variant="outline" size="sm"><Download className="w-4 h-4" /> Download</Button>
                            </a>
                          ) : null}
                          <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)} aria-label="Remove">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
      <PublicFooter />
    </>
  );
}
