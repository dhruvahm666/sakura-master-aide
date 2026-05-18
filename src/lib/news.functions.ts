import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORY_MAP: Record<string, string> = {
  world: "world",
  geopolitics: "politics",
  finance: "finance",
  india: "regional",
  science: "science",
  technology: "technology",
};

export const fetchNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      category: z.enum(["all", "world", "geopolitics", "finance", "india", "science", "technology"]).default("all"),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const key = process.env.CURRENTS_API_KEY;
    if (!key) throw new Error("CURRENTS_API_KEY is not configured.");

    const params = new URLSearchParams({ apiKey: key, language: "en", page_size: "15" });
    if (data.category === "india") {
      params.set("country", "IN");
    } else if (data.category !== "all") {
      params.set("category", CATEGORY_MAP[data.category]);
    }
    const url = `https://api.currentsapi.services/v1/latest-news?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Currents API ${res.status}`);
    }
    const json = (await res.json()) as { news?: Array<{ id: string; title: string; description: string; url: string; author?: string; published: string; image?: string; category?: string[] }> };
    return {
      articles: (json.news ?? []).slice(0, 15).map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        url: a.url,
        source: a.author || "Unknown",
        published: a.published,
        image: a.image && a.image !== "None" ? a.image : null,
        category: a.category?.[0] ?? null,
      })),
    };
  });
