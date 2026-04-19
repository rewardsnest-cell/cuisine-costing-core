import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { ArrowRight, Tag } from "lucide-react";

const getCoupon = createServerFn({ method: "GET" })
  .inputValidator((d: { itemId: string }) => d)
  .handler(async ({ data }) => {
    const { data: item } = await supabaseAdmin
      .from("sale_flyer_items")
      .select(
        "id,name,brand,pack_size,unit,sale_price,regular_price,savings,promo_image_url,flipp_image_url,flipp_short_link,sale_flyer_id"
      )
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw notFound();

    const { data: flyer } = await supabaseAdmin
      .from("sale_flyers")
      .select("id,title,sale_start_date,sale_end_date,supplier_id")
      .eq("id", (item as any).sale_flyer_id)
      .maybeSingle();

    return { item, flyer };
  });

export const Route = createFileRoute("/coupon/$itemId")({
  loader: ({ params }) => getCoupon({ data: { itemId: params.itemId } }),
  head: ({ loaderData }) => {
    const it: any = loaderData?.item;
    if (!it) return { meta: [{ title: "Coupon not found" }] };
    const title = `${it.name}${it.sale_price ? ` — $${Number(it.sale_price).toFixed(2)}` : ""} | VPS Finest`;
    const desc = `Limited-time savings on ${it.name}${it.brand ? ` (${it.brand})` : ""}. Tap to claim.`;
    const image = it.flipp_image_url || it.promo_image_url || undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        ...(image ? [{ property: "og:image", content: image }] : []),
        ...(image ? [{ name: "twitter:image", content: image }] : []),
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 grid place-items-center p-8">
        <Card className="p-8 text-center max-w-md">
          <h1 className="text-2xl font-semibold mb-2">Coupon not found</h1>
          <p className="text-muted-foreground mb-4">This offer may have ended.</p>
          <Link to="/menu"><Button>Browse menu</Button></Link>
        </Card>
      </main>
      <PublicFooter />
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 grid place-items-center p-8">
        <Card className="p-8 text-center max-w-md">
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">{error.message}</p>
        </Card>
      </main>
      <PublicFooter />
    </div>
  ),
  component: CouponPage,
});

function CouponPage() {
  const { item, flyer } = Route.useLoaderData() as any;
  const image = item.flipp_image_url || item.promo_image_url;
  const dates = [flyer?.sale_start_date, flyer?.sale_end_date].filter(Boolean).join(" – ");

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
      <PublicHeader />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-10 space-y-6">
        <div className="text-center space-y-2">
          <Badge variant="secondary" className="gap-1.5"><Tag className="w-3 h-3" /> Limited offer</Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{item.name}</h1>
          {item.brand && <p className="text-muted-foreground">{item.brand}{item.pack_size ? ` • ${item.pack_size}` : ""}</p>}
        </div>

        {image && (
          <Card className="overflow-hidden">
            <img src={image} alt={item.name} className="w-full h-auto" loading="eager" />
          </Card>
        )}

        <Card className="p-6 grid sm:grid-cols-3 gap-4 items-center">
          <div className="sm:col-span-2 space-y-1">
            {item.sale_price != null && (
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-primary">${Number(item.sale_price).toFixed(2)}</span>
                {item.regular_price != null && (
                  <span className="text-muted-foreground line-through">${Number(item.regular_price).toFixed(2)}</span>
                )}
              </div>
            )}
            {item.savings != null && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                You save ${Number(item.savings).toFixed(2)}
              </p>
            )}
            {dates && <p className="text-xs text-muted-foreground">Valid {dates}</p>}
          </div>
          <Link to="/quote" className="sm:justify-self-end w-full sm:w-auto">
            <Button size="lg" className="w-full gap-2">
              Use in your event <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Sharing this page? The link previews with the custom Flipp image automatically.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
