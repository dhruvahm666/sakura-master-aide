import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchNews } from "@/lib/news.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/news")({ component: NewsPage });

const CATS = ["all", "world", "geopolitics", "finance", "india", "science", "technology"] as const;
type Cat = typeof CATS[number];

function NewsPage() {
  const [cat, setCat] = useState<Cat>("all");
  const fn = useServerFn(fetchNews);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["news", cat],
    queryFn: () => fn({ data: { category: cat } }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-gradient-sakura">News</h1>
          <p className="text-sm text-muted-foreground">Curated for you, Master.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition ${cat === c ? "border-primary bg-primary/20 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/50"}`}>
            {c}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(data?.articles ?? []).map((a) => (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
            <Card className="glass h-full overflow-hidden transition hover:shadow-sakura">
              {a.image && <img src={a.image} alt="" className="h-40 w-full object-cover" loading="lazy" />}
              <CardContent className="p-4">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-primary">{a.source}</div>
                <h3 className="font-display text-lg leading-snug">{a.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{a.description}</p>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
