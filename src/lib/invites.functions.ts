import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Check whether public signup is allowed for a given email (allowlist OR first user). */
export const checkSignupAllowed = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data }) => {
    const { count: roleCount } = await supabaseAdmin
      .from("user_roles").select("*", { count: "exact", head: true });

    if ((roleCount ?? 0) === 0) {
      // No users yet — first signup is allowed (becomes admin)
      return { allowed: true, reason: "bootstrap" as const };
    }

    const { data: invited } = await supabaseAdmin
      .from("invited_emails").select("email").eq("email", data.email.toLowerCase()).maybeSingle();

    if (invited) return { allowed: true, reason: "invited" as const };
    return { allowed: false, reason: "not_invited" as const };
  });

/** Admin: add an email to the invite allowlist. */
export const inviteEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Check admin
    const { data: role } = await context.supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Only admins can invite users.");

    const { error } = await supabaseAdmin
      .from("invited_emails")
      .insert({ email: data.email.toLowerCase(), invited_by: userId });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

/** List invites — admin only. */
export const listInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!role) return { invites: [], isAdmin: false };
    const { data } = await supabaseAdmin
      .from("invited_emails").select("id, email, created_at").order("created_at", { ascending: false });
    return { invites: data ?? [], isAdmin: true };
  });

/** Whether current user is admin (cheap check). */
export const whoAmI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    return { userId: context.userId, role: role?.role ?? "user" };
  });

// Note: createClient import retained in case we later use a non-admin path
void createClient;
