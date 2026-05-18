import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { groqChat, type GroqMessage } from "@/lib/groq.server";
import { buildSakuraSystem } from "@/lib/sakura-prompt";

/** Send a message to Sakura within a thread; persists user + assistant messages. */
export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      threadId: z.string().uuid(),
      content: z.string().min(1).max(8000),
      mode: z.enum(["chat", "health", "advisor"]).default("chat"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify thread ownership
    const { data: thread, error: tErr } = await supabase
      .from("chat_threads").select("id, title").eq("id", data.threadId).maybeSingle();
    if (tErr || !thread) throw new Error("Thread not found");

    // Profile
    const { data: profile } = await supabase
      .from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
    const displayName = profile?.display_name ?? "Master";

    // Load history (last 30 messages)
    const { data: history } = await supabase
      .from("chat_messages").select("role, content").eq("thread_id", data.threadId)
      .order("created_at", { ascending: true }).limit(30);

    // Detect advisor triggers automatically
    let mode = data.mode;
    const txt = data.content.toLowerCase();
    if (mode === "chat" && /\b(i have a problem|need advice|help me decide|i'm stuck|should i|what should i do)\b/.test(txt)) {
      mode = "advisor";
    }

    const messages: GroqMessage[] = [
      { role: "system", content: buildSakuraSystem(displayName, mode) },
      ...((history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })) as GroqMessage[]),
      { role: "user", content: data.content },
    ];

    const assistantText = await groqChat(messages);

    // Persist user + assistant
    const { error: insErr } = await supabase.from("chat_messages").insert([
      { thread_id: data.threadId, user_id: userId, role: "user", content: data.content },
      { thread_id: data.threadId, user_id: userId, role: "assistant", content: assistantText },
    ]);
    if (insErr) throw new Error(`Failed to save messages: ${insErr.message}`);

    // Update thread timestamp + auto-title from first user message if still default
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (thread.title === "New conversation") {
      updates.title = data.content.slice(0, 60);
    }
    await supabase.from("chat_threads").update(updates).eq("id", data.threadId);

    return { assistant: assistantText };
  });

/** Create a new thread. */
export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("chat_threads")
      .insert({ user_id: userId, title: "New conversation" })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to create thread");
    return { id: data.id };
  });

/** Delete a thread. */
export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("chat_threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Ad-hoc one-shot ask for News/Markets/Health quick-asks (no persistence). */
export const askSakura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      prompt: z.string().min(1).max(4000),
      mode: z.enum(["chat", "health", "advisor"]).default("chat"),
      context: z.string().max(4000).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
    const messages: GroqMessage[] = [
      { role: "system", content: buildSakuraSystem(profile?.display_name ?? "Master", data.mode) },
      ...(data.context ? [{ role: "user" as const, content: `Context:\n${data.context}` }] : []),
      { role: "user", content: data.prompt },
    ];
    const answer = await groqChat(messages);
    return { answer };
  });
