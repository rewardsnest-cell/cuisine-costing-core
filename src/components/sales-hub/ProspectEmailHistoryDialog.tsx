import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, ArrowDownLeft, ArrowUpRight } from "lucide-react";

export interface ProspectEmailHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: {
    id: string;
    business_name: string;
    email: string | null;
  } | null;
  onFollowUp?: () => void;
}

type LogEntry = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  body_preview: string | null;
  from_email: string | null;
  to_email: string | null;
  contacted_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function ProspectEmailHistoryDialog({
  open, onOpenChange, prospect, onFollowUp,
}: ProspectEmailHistoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !prospect) return;
    setExpanded(new Set());
    setLoading(true);
    (supabase as any)
      .from("sales_contact_log")
      .select("id, channel, direction, subject, body_text, body_html, body_preview, from_email, to_email, contacted_at")
      .eq("prospect_id", prospect.id)
      .in("channel", ["email", "email_inbound"])
      .order("contacted_at", { ascending: false })
      .limit(50)
      .then(({ data, error }: any) => {
        if (error) toast.error(error.message);
        setEntries(data || []);
        setLoading(false);
      });
  }, [open, prospect]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4" /> Email history — {prospect?.business_name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No emails sent or received yet.
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => {
              const isInbound = e.direction === "inbound";
              const isOpen = expanded.has(e.id);
              const body = e.body_text || e.body_preview || "(no body saved)";
              return (
                <div key={e.id} className="border rounded-md">
                  <button
                    onClick={() => toggle(e.id)}
                    className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-muted/50"
                  >
                    {isInbound
                      ? <ArrowDownLeft className="w-4 h-4 mt-0.5 text-blue-600" />
                      : <ArrowUpRight className="w-4 h-4 mt-0.5 text-green-600" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={isInbound ? "default" : "secondary"} className="text-[10px]">
                          {isInbound ? "Received" : "Sent"}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {e.subject || "(no subject)"}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                          {timeAgo(e.contacted_at)} · {new Date(e.contacted_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {isInbound ? `From: ${e.from_email || "?"}` : `To: ${e.to_email || "?"}`}
                      </div>
                      {!isOpen && (
                        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {e.body_preview || body.slice(0, 140)}
                        </div>
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 border-t bg-muted/30">
                      <pre className="text-xs whitespace-pre-wrap font-sans text-foreground">
                        {body}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {onFollowUp && prospect?.email && (
          <div className="flex justify-end pt-2 border-t">
            <Button onClick={() => { onOpenChange(false); onFollowUp(); }} className="gap-1.5">
              <Mail className="w-4 h-4" /> Send follow-up
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
