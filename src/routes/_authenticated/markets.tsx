import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, TrendingDown } from "lucide-react";
import { fetchMarkets } from "@/lib/markets.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/markets")({ component: MarketsPage });

interface Metal { price?: number; price_gram_24k?: number; ch?: number; chp?: number }

function MetalCard({ title, inr, usd }: { title: string; inr: Metal | null; usd: Metal | null }) {
  const change = inr?.chp ?? usd?.chp ?? 0;
  const up = change >= 0;
  return (
    <Card className="glass">
      <CardHeader><CardTitle className="font-display text-2xl">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">INR / gram</span>
          <span className="font-display text-3xl text-gradient-sakura">
            {inr?.price_gram_24k ? `₹${inr.price_gram_24k.toFixed(2)}` : "—"}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">USD / oz</span>
          <span className="text-xl">{usd?.price ? `$${usd.price.toFixed(2)}` : "—"}</span>
        </div>
        <div className={`flex items-center gap-1 text-sm ${up ? "text-emerald-400" : "text-rose-400"}`}>
          {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {change ? `${change.toFixed(2)}%` : "—"} today
        </div>
      </CardContent>
    </Card>
  );
}

function MarketsPage() {
  const fn = useServerFn(fetchMarkets);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["markets"],
    queryFn: () => fn({ data: undefined }),
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-gradient-sakura">Markets</h1>
          <p className="text-sm text-muted-foreground">Live precious metals & USD/INR</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading markets…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {data && <MetalCard title="Gold" inr={data.gold.inr} usd={data.gold.usd} />}
        {data && <MetalCard title="Silver" inr={data.silver.inr} usd={data.silver.usd} />}
        {data && (
          <Card className="glass">
            <CardHeader><CardTitle className="font-display text-2xl">USD / INR</CardTitle></CardHeader>
            <CardContent>
              <div className="font-display text-4xl text-gradient-sakura">
                {data.fx.usdInr ? `₹${data.fx.usdInr.toFixed(3)}` : "—"}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Updated {data.fx.updatedUnix ? new Date(data.fx.updatedUnix * 1000).toLocaleString() : "—"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
