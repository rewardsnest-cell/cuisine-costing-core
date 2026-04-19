import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Loader2, Link2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { createFlippLink } from "@/lib/server-fns/flipp.functions";

type Props = {
  /** Public destination URL (the page social previewers should land on). */
  destinationUrl: string;
  /** Variables to send to the Flipp template. */
  values: { name: string; value: string | null }[];
  /** What this link points at — used for persistence + UTM campaign id. */
  target: { kind: "sale_flyer_item" | "sale_flyer"; id: string };
  /** Existing short link (if already generated). */
  existingShortLink?: string | null;
  /** Override the configured FLIPP_TEMPLATE_ID. */
  templateId?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary" | "ghost";
  onCreated?: (out: { short_link: string; image_url: string | null }) => void;
};

export function FlippLinkButton({
  destinationUrl,
  values,
  target,
  existingShortLink,
  templateId,
  size = "sm",
  variant = "outline",
  onCreated,
}: Props) {
  const create = useServerFn(createFlippLink);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shortLink, setShortLink] = useState<string | null>(existingShortLink ?? null);

  const run = async () => {
    setRunning(true);
    try {
      const out = await create({
        data: {
          template_id: templateId,
          values,
          destination_url: destinationUrl,
          target,
          campaign: `${target.kind}_${target.id}`,
        },
      });
      setShortLink(out.short_link);
      onCreated?.({ short_link: out.short_link, image_url: out.image_url ?? null });
      toast.success("Trackable Flipp link created");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create Flipp link");
    } finally {
      setRunning(false);
    }
  };

  const copy = async () => {
    if (!shortLink) return;
    await navigator.clipboard.writeText(shortLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-1">
      <Button type="button" size={size} variant={variant} onClick={run} disabled={running} className="gap-1.5">
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {shortLink ? "Regenerate link" : "Trackable link"}
      </Button>
      {shortLink && (
        <Button type="button" size="icon" variant="ghost" onClick={copy} title="Copy link" className="h-7 w-7">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      )}
    </div>
  );
}
