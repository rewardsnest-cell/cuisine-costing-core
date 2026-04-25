// Stuck-run recovery alert dispatcher.
//
// Called from `recoverStuckCatalogRuns` for each recovered run whose
// stuck_for_minutes meets/exceeds the configured threshold. Persists a
// banner-visible event row to `pricing_v2_alert_events` and (optionally)
// fans out an email + outbound webhook based on `pricing_v2_alert_config`.

import { createHmac } from "node:crypto";

export type AlertConfig = {
  stuck_minutes_threshold: number;
  banner_enabled: boolean;
  email_enabled: boolean;
  email_recipients: string[];
  webhook_enabled: boolean;
  webhook_url: string | null;
  webhook_secret: string | null;
};

export type RecoveredRunBreach = {
  run_id: string;
  stage: string;
  stuck_for_minutes: number;
  started_at: string | null;
  counts_in: number;
  counts_out: number;
  warnings_count: number;
  errors_count: number;
  message: string;
};

const DEFAULT_CONFIG: AlertConfig = {
  stuck_minutes_threshold: 30,
  banner_enabled: true,
  email_enabled: false,
  email_recipients: [],
  webhook_enabled: false,
  webhook_url: null,
  webhook_secret: null,
};

export async function loadAlertConfig(supabase: any): Promise<AlertConfig> {
  const { data } = await supabase
    .from("pricing_v2_alert_config")
    .select(
      "stuck_minutes_threshold, banner_enabled, email_enabled, email_recipients, webhook_enabled, webhook_url, webhook_secret",
    )
    .eq("id", 1)
    .maybeSingle();
  if (!data) return DEFAULT_CONFIG;
  return {
    stuck_minutes_threshold: Number(data.stuck_minutes_threshold) || DEFAULT_CONFIG.stuck_minutes_threshold,
    banner_enabled: !!data.banner_enabled,
    email_enabled: !!data.email_enabled,
    email_recipients: Array.isArray(data.email_recipients) ? data.email_recipients : [],
    webhook_enabled: !!data.webhook_enabled,
    webhook_url: data.webhook_url ?? null,
    webhook_secret: data.webhook_secret ?? null,
  };
}

async function sendEmailAlert(breach: RecoveredRunBreach, config: AlertConfig, baseUrl: string) {
  if (!config.email_enabled || config.email_recipients.length === 0) {
    return { sent: false, recipients: [] as string[], skipped: "disabled_or_no_recipients" };
  }
  const sent: string[] = [];
  const errors: string[] = [];
  for (const to of config.email_recipients) {
    try {
      const res = await fetch(`${baseUrl}/lovable/email/transactional/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: "stuck-recovery-alert",
          recipientEmail: to,
          // Stable idempotency key per (run, recipient) — retries won't dup.
          idempotencyKey: `stuck-alert-${breach.run_id}-${to}`,
          templateData: {
            run_id: breach.run_id,
            stage: breach.stage,
            stuck_for_minutes: breach.stuck_for_minutes,
            threshold: config.stuck_minutes_threshold,
            started_at: breach.started_at,
            counts_in: breach.counts_in,
            counts_out: breach.counts_out,
            warnings_count: breach.warnings_count,
            errors_count: breach.errors_count,
            details_url: `${baseUrl}/admin/pricing-v2/catalog`,
          },
        }),
      });
      if (!res.ok) {
        errors.push(`${to}: HTTP ${res.status}`);
      } else {
        sent.push(to);
      }
    } catch (e: any) {
      errors.push(`${to}: ${e?.message ?? String(e)}`);
    }
  }
  return {
    sent: sent.length > 0,
    recipients: sent,
    error: errors.length ? errors.join("; ") : undefined,
  };
}

async function sendWebhookAlert(breach: RecoveredRunBreach, config: AlertConfig) {
  if (!config.webhook_enabled || !config.webhook_url) {
    return { sent: false, skipped: "disabled_or_no_url" };
  }
  const payload = {
    event: "pricing_v2.stuck_run_recovered",
    run_id: breach.run_id,
    stage: breach.stage,
    stuck_for_minutes: breach.stuck_for_minutes,
    threshold_minutes: config.stuck_minutes_threshold,
    started_at: breach.started_at,
    counts: {
      in: breach.counts_in,
      out: breach.counts_out,
      warnings: breach.warnings_count,
      errors: breach.errors_count,
    },
    message: breach.message,
    fired_at: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "lovable-pricing-v2-alerts/1",
  };
  if (config.webhook_secret) {
    const sig = createHmac("sha256", config.webhook_secret).update(body).digest("hex");
    headers["X-Pricing-V2-Signature"] = `sha256=${sig}`;
  }
  try {
    const res = await fetch(config.webhook_url, { method: "POST", headers, body });
    return {
      sent: res.ok,
      status: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return { sent: false, status: 0, error: e?.message ?? String(e) };
  }
}

/**
 * Dispatch alerts for any recovered run whose stuck_for_minutes >= threshold.
 * Always inserts a `pricing_v2_alert_events` row (the banner reads from this
 * table); email and webhook only fire when their toggles are enabled.
 */
export async function dispatchStuckRecoveryAlerts(
  supabase: any,
  breaches: RecoveredRunBreach[],
  baseUrl: string,
): Promise<{ fired: number; events: any[] }> {
  if (breaches.length === 0) return { fired: 0, events: [] };
  const config = await loadAlertConfig(supabase);

  const eligible = breaches.filter(
    (b) => b.stuck_for_minutes >= config.stuck_minutes_threshold,
  );
  if (eligible.length === 0) return { fired: 0, events: [] };

  const insertedEvents: any[] = [];
  for (const b of eligible) {
    const [emailRes, webhookRes] = await Promise.all([
      sendEmailAlert(b, config, baseUrl),
      sendWebhookAlert(b, config),
    ]);
    const channels = {
      banner: config.banner_enabled,
      email: emailRes,
      webhook: webhookRes,
    };
    const { data: ev } = await supabase
      .from("pricing_v2_alert_events")
      .insert({
        run_id: b.run_id,
        stage: b.stage,
        stuck_for_minutes: b.stuck_for_minutes,
        threshold_minutes: config.stuck_minutes_threshold,
        message: b.message,
        channels,
      })
      .select("id, created_at")
      .single();
    insertedEvents.push({ ...ev, run_id: b.run_id, channels });
  }
  return { fired: insertedEvents.length, events: insertedEvents };
}
