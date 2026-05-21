import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { groqChat, type GroqMessage } from "@/lib/groq.server";
import { buildSakuraSystem } from "@/lib/sakura-prompt";

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

/** Voice-tuned reply: short, conversational, plain prose (no markdown/charts). */
export const voiceReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      message: z.string().min(1).max(4000),
      history: z.array(turnSchema).max(40).default([]),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
    const name = profile?.display_name ?? "Master";

    const system = buildSakuraSystem(name, "chat") + `

You are now in VOICE MODE. The user is talking to you out loud and you respond out loud.
Rules:
- Keep responses to 1-4 short sentences unless the user explicitly asks for detail.
- Speak naturally, like a warm, intelligent friend. No headings, no bullet lists, no markdown, no tables, no charts, no code blocks, no emoji. Plain spoken prose only.
- Occasionally use brief natural affirmations ("Of course, Master.", "Absolutely.", "Let me think...").
- Always still address the user as "Master ${name}" when natural.`;

    const messages: GroqMessage[] = [
      { role: "system", content: system },
      ...data.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.message },
    ];
    const reply = await groqChat(messages, { temperature: 0.75 });
    return { reply, name };
  });

/** Save a completed voice session transcript. */
export const saveVoiceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      title: z.string().min(1).max(200).optional(),
      transcript: z.array(turnSchema).min(1).max(200),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const title = data.title ?? data.transcript.find((t) => t.role === "user")?.content.slice(0, 80) ?? "Voice conversation";
    const { data: row, error } = await supabase
      .from("voice_sessions")
      .insert({ user_id: userId, title, transcript: data.transcript })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to save voice session");
    return { id: row.id };
  });

export const listVoiceSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("voice_sessions")
      .select("id, title, transcript, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; title: string; transcript: Array<{ role: "user" | "assistant"; content: string }>; created_at: string }>;
  });

export const deleteVoiceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("voice_sessions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Get the user's display name (used to greet at voice start). */
export const getVoiceUserName = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles").select("display_name").eq("user_id", context.userId).maybeSingle();
    return { name: data?.display_name ?? "Master" };
  });
