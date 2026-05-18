import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface MetalPayload {
  price_gram_24k?: number; // GoldAPI gives gram price for INR/USD
  price?: number; // per ounce
  ch?: number;    // daily change (price units)
  chp?: number;   // daily change (%)
  timestamp?: number;
}

async function fetchMetal(symbol: "XAU" | "XAG", currency: "INR" | "USD"): Promise<MetalPayload> {
  const key = process.env.GOLD_API_KEY;
  if (!key) throw new Error("GOLD_API_KEY is not configured.");
  const res = await fetch(`https://www.goldapi.io/api/${symbol}/${currency}`, {
    headers: { "x-access-token": key, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`GoldAPI ${symbol}/${currency} ${res.status}`);
  return (await res.json()) as MetalPayload;
}

export const fetchMarkets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const exKey = process.env.EXCHANGE_API_KEY;
    if (!exKey) throw new Error("EXCHANGE_API_KEY is not configured.");

    const [goldInr, goldUsd, silverInr, silverUsd, fxRes] = await Promise.allSettled([
      fetchMetal("XAU", "INR"),
      fetchMetal("XAU", "USD"),
      fetchMetal("XAG", "INR"),
      fetchMetal("XAG", "USD"),
      fetch(`https://v6.exchangerate-api.com/v6/${exKey}/latest/USD`).then((r) => r.json()),
    ]);

    const safe = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);
    const safeErr = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String(r.reason) : null);

    const fx = safe(fxRes) as { conversion_rates?: Record<string, number>; time_last_update_unix?: number; result?: string } | null;
    const usdInr = fx?.conversion_rates?.INR ?? null;

    return {
      updatedAt: new Date().toISOString(),
      gold: {
        inr: safe(goldInr),
        usd: safe(goldUsd),
        errors: [safeErr(goldInr), safeErr(goldUsd)].filter(Boolean),
      },
      silver: {
        inr: safe(silverInr),
        usd: safe(silverUsd),
        errors: [safeErr(silverInr), safeErr(silverUsd)].filter(Boolean),
      },
      fx: {
        usdInr,
        updatedUnix: fx?.time_last_update_unix ?? null,
        error: safeErr(fxRes),
      },
    };
  });
