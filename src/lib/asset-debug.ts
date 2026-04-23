/**
 * Lightweight in-memory log of site_asset_manifest fetches for the current
 * browser session. Used by the admin debug panel to surface RLS or client
 * errors without needing to dig through devtools.
 */

export type AssetEventStatus = "ok" | "missing" | "error";

export interface AssetEvent {
  id: string;
  slug: string;
  status: AssetEventStatus;
  url: string | null;
  error: string | null;
  at: number;
}

const MAX_EVENTS = 200;
const events: AssetEvent[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function recordAssetEvent(input: {
  slug: string;
  status: AssetEventStatus;
  url?: string | null;
  error?: string | null;
}) {
  if (typeof window === "undefined") return;
  const evt: AssetEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slug: input.slug,
    status: input.status,
    url: input.url ?? null,
    error: input.error ?? null,
    at: Date.now(),
  };
  events.unshift(evt);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  notify();
}

export function getAssetEvents(): AssetEvent[] {
  return events.slice();
}

export function clearAssetEvents() {
  events.length = 0;
  notify();
}

export function subscribeAssetEvents(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
