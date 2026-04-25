/**
 * Send a prospect outreach email via Outlook (server-side).
 *
 * Auth: requires Bearer <SUPABASE_PUBLISHABLE_KEY> + the user's Supabase JWT
 * forwarded by the client. We verify the user is an admin before sending.
 *
 * Body: { prospectId, templateKey, subject, html, text, isReply?, replyToConversationId? }
 *
 * On success, logs to sales_contact_log (direction=outbound) and updates the
 * prospect's last_contacted / last_outbound_at / status.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { sendOutlookEmail } from "@/lib/outlook/send";

const Body = z.object({
  prospectId: z.string().uuid(),
  templateKey: z.string().min(1).max(80),
  subject: z.string().min(1).max(300),
  html: z.string().min(1).max(50_000),
  text: z.string().min(1).max(50_000),
  isReply: z.boolean().optional(),
  /** Optional override entered/confirmed in the review step. Falls back to prospect.email. */
  recipientEmail: z.string().email().max(320).optional(),
});

export const Route = createFileRoute("/api/public/hooks/send-prospect-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !anonKey || !serviceKey) {
          return Response.json({ error: "Server config error" }, { status: 500 });
        }

        // Verify caller via their JWT
        const auth = request.headers.get("authorization") ?? "";
        const jwt = auth.replace(/^Bearer\s+/i, "");
        if (!jwt) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const userClient = createClient<Database>(supabaseUrl, anonKey, {
          global: { headers: { Authorization: `Bearer ${jwt}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userRes, error: userErr } = await userClient.auth.getUser();
        if (userErr || !userRes?.user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = userRes.user.id;

        // Confirm admin
        const { data: isAdmin } = await userClient.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch (e: any) {
          return Response.json({ error: `Invalid body: ${e?.message ?? e}` }, { status: 400 });
        }

        const supabase = createClient<Database>(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: prospect, error: pErr } = await (supabase as any)
          .from("sales_prospects")
          .select("id, business_name, email, status")
          .eq("id", body.prospectId)
          .maybeSingle();
        if (pErr || !prospect) {
          return Response.json({ error: "Prospect not found" }, { status: 404 });
        }
        if (!prospect.email && !body.recipientEmail) {
          return Response.json({ error: "Prospect has no email" }, { status: 400 });
        }
        const toEmail = (body.recipientEmail ?? prospect.email)!.trim();

        const attemptedAt = new Date();
        const t0 = Date.now();
        const sendResult = await sendOutlookEmail({
          to: toEmail,
          subject: body.subject,
          html: body.html,
          text: body.text,
        });
        const completedAt = new Date();
        const durationMs = Date.now() - t0;

        // Granular audit row for every Outlook attempt (lead_id null for prospects).
        await (supabase as any).from("lead_email_audit").insert({
          lead_id: null,
          recipient: prospect.email,
          subject: body.subject,
          body_preview: body.text.slice(0, 240),
          source: "prospect",
          template_name: body.templateKey,
          status: sendResult.ok ? "sent" : "failed",
          http_status: sendResult.status,
          error_message: sendResult.ok ? null : sendResult.error ?? `HTTP ${sendResult.status}`,
          attempted_at: attemptedAt.toISOString(),
          completed_at: completedAt.toISOString(),
          duration_ms: durationMs,
          actor_user_id: userId,
          metadata: { prospect_id: prospect.id, channel: "outlook" },
        });

        if (!sendResult.ok) {
          // Log the failed attempt with whatever IDs we managed to capture.
          await (supabase as any).from("sales_contact_log").insert({
            prospect_id: prospect.id,
            channel: "email",
            outcome: "failed",
            direction: "outbound",
            subject: body.subject,
            body_html: body.html,
            body_text: body.text,
            body_preview: body.text.slice(0, 240),
            template_key: body.templateKey,
            from_email: null,
            to_email: prospect.email,
            outlook_message_id: sendResult.outlookMessageId ?? null,
            outlook_conversation_id: sendResult.outlookConversationId ?? null,
            internet_message_id: sendResult.internetMessageId ?? null,
            notes: sendResult.error ?? `HTTP ${sendResult.status}`,
            contacted_by: userId,
          });
          return Response.json(
            { ok: false, error: sendResult.error ?? `Outlook ${sendResult.status}` },
            { status: 502 },
          );
        }

        const now = completedAt.toISOString();
        await (supabase as any).from("sales_contact_log").insert({
          prospect_id: prospect.id,
          channel: "email",
          outcome: "sent",
          direction: "outbound",
          subject: body.subject,
          body_html: body.html,
          body_text: body.text,
          body_preview: body.text.slice(0, 240),
          template_key: body.templateKey,
          from_email: null,
          to_email: prospect.email,
          outlook_message_id: sendResult.outlookMessageId ?? null,
          outlook_conversation_id: sendResult.outlookConversationId ?? null,
          internet_message_id: sendResult.internetMessageId ?? null,
          contacted_by: userId,
          contacted_at: now,
        });

        await (supabase as any)
          .from("sales_prospects")
          .update({
            last_contacted: now,
            last_outbound_at: now,
            status: prospect.status === "New" ? "Contacted" : prospect.status,
          })
          .eq("id", prospect.id);

        return Response.json({ ok: true });
      },
    },
  },
});
