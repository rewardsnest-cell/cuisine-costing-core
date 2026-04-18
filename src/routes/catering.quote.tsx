import { createFileRoute } from "@tanstack/react-router";
import { QuotePage } from "./quote";

export const Route = createFileRoute("/catering/quote")({
  head: () => ({
    meta: [
      { title: "Build Your Catering Quote — VPS Finest" },
      { name: "description", content: "Create a customized catering proposal in minutes. Aurora, Ohio." },
      { property: "og:title", content: "Build Your Catering Quote — VPS Finest" },
      { property: "og:description", content: "Create a customized catering proposal in minutes. Aurora, Ohio." },
    ],
  }),
  component: QuotePage,
});
