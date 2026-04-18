// Shared helpers for Lovable AI Gateway calls (server-only).
// Do NOT import this file from client code — it reads process.env.

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export function getApiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

export class AiGatewayError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

/** POST a chat-completions body. Throws AiGatewayError on non-2xx. */
export async function aiPost(body: unknown): Promise<Response> {
  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 429) throw new AiGatewayError(429, "Rate limit reached. Please wait and try again.");
    if (resp.status === 402) throw new AiGatewayError(402, "AI credits exhausted.");
    console.error("AI gateway error:", resp.status, text);
    throw new AiGatewayError(resp.status, `AI gateway error ${resp.status}`);
  }
  return resp;
}
