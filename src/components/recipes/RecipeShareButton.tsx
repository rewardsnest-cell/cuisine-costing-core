import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

const SITE = "https://www.vpsfinest.com";

interface Props {
  recipeId: string;
  recipeName: string;
  hook?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  ingredients?: Array<{ name: string; quantity?: number | null; unit?: string | null }>;
}

export function RecipeShareButton({ recipeId, recipeName, hook, description, imageUrl, ingredients = [] }: Props) {
  const url = `${SITE}/recipes/${recipeId}`;
  const shortText = hook || description || "";
  const caption = `${recipeName} 🍴\n${shortText ? shortText + "\n\n" : "\n"}Full recipe → vpsfinest.com/recipes/${recipeId}\n#catering #ohio #recipe`;
  const ytDescription = `${recipeName}\n\n${shortText ? shortText + "\n\n" : ""}Full recipe with ingredients & instructions:\n${url}\n\n${
    ingredients.length
      ? "Ingredients:\n" +
        ingredients
          .slice(0, 20)
          .map((i) => `• ${[i.quantity, i.unit, i.name].filter(Boolean).join(" ")}`)
          .join("\n") +
        "\n\n"
      : ""
  }Catering inquiries → ${SITE}/catering/quote`;

  const [qr, setQr] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || qr) return;
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setQr).catch(() => {});
  }, [open, url, qr]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const nativeShare = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: recipeName, text: shortText, url });
      } catch {}
    } else {
      copy(url, "Link");
    }
  };

  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition text-sm"
        >
          Share
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Quick share</p>
          <div className="flex flex-wrap gap-2">
            <a href={fbUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline">Facebook</Button>
            </a>
            <Button size="sm" variant="outline" onClick={nativeShare}>Share…</Button>
            <Button size="sm" variant="outline" onClick={() => copy(url, "Link")}>Copy link</Button>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Instagram / TikTok caption</p>
          <textarea
            readOnly
            value={caption}
            className="w-full h-28 text-xs p-2 rounded-md border border-border bg-secondary/30 font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button size="sm" className="mt-2 w-full" onClick={() => copy(caption, "Caption")}>
            Copy caption
          </Button>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">YouTube description</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => copy(ytDescription, "YouTube description")}>
            Copy YouTube description
          </Button>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">QR code (for video overlays)</p>
          {qr ? (
            <a href={qr} download={`${recipeName.replace(/\s+/g, "-").toLowerCase()}-qr.png`} className="block">
              <img src={qr} alt={`QR code for ${recipeName}`} className="w-40 h-40 mx-auto rounded-md border border-border bg-white p-2" />
              <p className="text-[10px] text-center text-muted-foreground mt-1">Tap to download</p>
            </a>
          ) : (
            <div className="w-40 h-40 mx-auto rounded-md bg-secondary animate-pulse" />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
