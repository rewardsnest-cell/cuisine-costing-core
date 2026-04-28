// Grocery Pricing API (RapidAPI) client — backend only.
// Host: grocery-pricing-api.p.rapidapi.com
// Auth: X-RapidAPI-Key header

const HOST = "grocery-pricing-api.p.rapidapi.com";

export class GroceryPricingApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "GroceryPricingApiError";
  }
}

export async function fetchGroceryPrice(query: string): Promise<{
  raw: unknown;
  endpoint: string;
}> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new GroceryPricingApiError(0, "RAPIDAPI_KEY is not configured on the server.");
  }

  // The host exposes a few endpoints; we attempt the most common search-style one.
  // We pass the query as `name` and `country=us` per the spec in the prompt.
  const url = new URL(`https://${HOST}/price/search`);
  url.searchParams.set("name", query);
  url.searchParams.set("country", "us");

  const res = await fetch(url.toString(), {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": HOST,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { __raw_text: text };
  }

  if (!res.ok) {
    throw new GroceryPricingApiError(
      res.status,
      `Grocery Pricing API error ${res.status}: ${res.statusText}`,
      json,
    );
  }

  return { raw: json, endpoint: url.toString() };
}
