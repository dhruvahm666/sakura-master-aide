import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { groqChat, type GroqMessage } from "@/lib/groq.server";
import { buildSakuraSystem } from "@/lib/sakura-prompt";

export const submitCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      day_summary: z.string().max(2000).default(""),
      completed_text: z.string().max(2000).default(""),
      problems_text: z.string().max(2000).default(""),
      energy: z.number().int().min(1).max(10),
      mood: z.string().min(1).max(20),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
    const name = profile?.display_name ?? "Master";

    const userMsg = `Day summary: ${data.day_summary || "(none)"}
Completed today: ${data.completed_text || "(none)"}
Problems/blockers: ${data.problems_text || "(none)"}
Energy: ${data.energy}/10
Mood: ${data.mood}`;

    const messages: GroqMessage[] = [
      { role: "system", content: buildSakuraSystem(name, "checkin") },
      { role: "user", content: userMsg },
    ];

    const raw = await groqChat(messages, { responseFormat: "json_object", temperature: 0.7 });
    let parsed: { reflection?: string; schedule?: Array<{ time: string; block: string }>; priorities?: string[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reflection: raw, schedule: [], priorities: [] };
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await supabase.from("checkins").insert({
      user_id: userId,
      day: today,
      day_summary: data.day_summary,
      completed_text: data.completed_text,
      problems_text: data.problems_text,
      energy: data.energy,
      mood: data.mood,
      reflection: parsed.reflection ?? null,
      schedule: parsed.schedule ?? [],
      priorities: parsed.priorities ?? [],
    }).select("*").single();
    if (error) throw new Error(error.message);

    return { checkin: row };
  });
