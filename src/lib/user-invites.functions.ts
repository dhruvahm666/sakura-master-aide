import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Only the owner can manage invites.");
}

function makeCode() {
  // URL-safe 24-char code
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const createUserInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email().max(255), origin: z.string().url().max(500) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const email = data.email.toLowerCase();
    const code = makeCode();
    const { data: row, error } = await supabaseAdmin
      .from("user_invites")
      .insert({ email, code, invited_by: context.userId })
      .select("id, email, code, expires_at")
      .single();
    if (error) throw new Error(error.message);

    const link = `${data.origin.replace(/\/$/, "")}/login?invite=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`;

    // Best-effort email send via Lovable email queue (if infra is set up).
    let emailQueued = false;
    try {
      const { error: rpcErr } = await supabaseAdmin.rpc("enqueue_email" as never, {
        queue_name: "transactional_emails",
        payload: {
          to: email,
          subject: "You're invited to Sakura",
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;background:#fff;color:#111">
            <h1 style="font-size:22px;margin:0 0 12px">Welcome to Sakura's garden 🌸</h1>
            <p>You've been invited to Sakura. Click the link below to create your account. This invite expires in 7 days.</p>
            <p style="margin:24px 0"><a href="${link}" style="background:#e8729c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Accept your invite</a></p>
            <p style="font-size:12px;color:#666;word-break:break-all">Or open this link: ${link}</p>
          </div>`,
          text: `You're invited to Sakura. Open this link to create your account (expires in 7 days):\n\n${link}`,
        },
      } as never);
      emailQueued = !rpcErr;
    } catch {
      emailQueued = false;
    }

    return { id: row.id, email: row.email, code: row.code, link, expires_at: row.expires_at, emailQueued };
  });

export const listUserInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("user_invites")
      .select("id, email, code, expires_at, used_at, used_by, created_at")
      .order("created_at", { ascending: false });
    return { invites: data ?? [] };
  });

export const revokeUserInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("user_invites").delete().eq("id", data.id).is("used_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public: look up an invite by code (used by signup page to prefill email). */
export const lookupInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("user_invites")
      .select("email, expires_at, used_at")
      .eq("code", data.code)
      .maybeSingle();
    if (!row) return { valid: false as const, reason: "not_found" as const };
    if (row.used_at) return { valid: false as const, reason: "used" as const };
    if (new Date(row.expires_at) < new Date()) return { valid: false as const, reason: "expired" as const };
    return { valid: true as const, email: row.email };
  });

/** Public: mark an invite as used after signup. The code itself is the secret. */
export const consumeInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("user_invites")
      .select("id, email, expires_at, used_at")
      .eq("code", data.code)
      .maybeSingle();
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      return { ok: false };
    }
    await supabaseAdmin
      .from("user_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);
    return { ok: true };
  });

