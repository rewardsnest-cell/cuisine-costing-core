import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";

type LogRow = {
  id: string;
  pulled_at: string;
  series_count: number;
  matched_count: number;
  applied_count: number;
  created_count: number;
  skipped_count: number;
  errors: any;
  notes: string | null;
};

export function FredPullHistory() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("fred_pull_log")
        .select("*")
        .order("pulled_at", { ascending: false })
        .limit(20);
      setRows((data as LogRow[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <History className="w-4 h-4" /> Recent FRED Pulls
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingState label="Loading pull history…" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No FRED pulls yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Pulled</th>
                  <th className="py-2 pr-3 text-right">Series</th>
                  <th className="py-2 pr-3 text-right">Matched</th>
                  <th className="py-2 pr-3 text-right">Applied</th>
                  <th className="py-2 pr-3 text-right">Created</th>
                  <th className="py-2 pr-3 text-right">Skipped</th>
                  <th className="py-2 pr-3">Errors</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const errCount = Array.isArray(r.errors) ? r.errors.length : 0;
                  return (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="py-1.5 pr-3 tabular-nums">
                        {new Date(r.pulled_at).toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.series_count}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.matched_count}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{r.applied_count}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.created_count}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{r.skipped_count}</td>
                      <td className="py-1.5 pr-3">
                        {errCount === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge variant="destructive">{errCount}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
