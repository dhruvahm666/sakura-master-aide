import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { groqChat, type GroqMessage } from "@/lib/groq.server";
import { buildSakuraSystem } from "@/lib/sakura-prompt";

export const generateWeeklyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ goals: z.string().min(1).max(3000), weekStart: z.string() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
    const name = profile?.display_name ?? "Master";

    const sys = buildSakuraSystem(name, "chat") + `
Generate a structured weekly plan as JSON ONLY, no prose outside the JSON.
The week starts on ${data.weekStart} (Monday).
Categories: study, work, meeting, party, vacation, health, other.
Return: {"events":[{"title":"...","category":"study","day_offset":0,"start":"09:00","end":"10:30","notes":"..."}]}
day_offset is 0..6 (0 = Monday). Use 24h times. Include 12-20 well-spaced events.
`;
    const messages: GroqMessage[] = [
      { role: "system", content: sys },
      { role: "user", content: `My goals this week:\n${data.goals}` },
    ];

    const raw = await groqChat(messages, { responseFormat: "json_object" });
    let parsed: { events?: Array<{ title: string; category: string; day_offset: number; start: string; end: string; notes?: string }> } = { events: [] };
    try { parsed = JSON.parse(raw); } catch { /* keep empty */ }

    const validCats = new Set(["study", "work", "meeting", "party", "vacation", "health", "other"]);
    const base = new Date(data.weekStart + "T00:00:00");
    const rows = (parsed.events ?? []).slice(0, 30).map((e) => {
      const day = new Date(base);
      day.setDate(day.getDate() + Math.max(0, Math.min(6, Math.floor(e.day_offset ?? 0))));
      const [sh, sm] = (e.start ?? "09:00").split(":").map(Number);
      const [eh, em] = (e.end ?? "10:00").split(":").map(Number);
      const start = new Date(day); start.setHours(sh ?? 9, sm ?? 0, 0, 0);
      const end = new Date(day); end.setHours(eh ?? 10, em ?? 0, 0, 0);
      const category = validCats.has(e.category) ? e.category : "other";
      return {
        user_id: userId,
        title: String(e.title ?? "Untitled").slice(0, 200),
        category,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        notes: e.notes ? String(e.notes).slice(0, 500) : null,
      };
    });

    if (rows.length) {
      const { error } = await context.supabase.from("planner_events").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { inserted: rows.length };
  });
