import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { askSakura } from "@/lib/chat.functions";
import { SakuraMarkdown } from "@/components/SakuraMarkdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/health")({ component: HealthPage });

function HealthPage() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const ask = useServerFn(askSakura);
  const mut = useMutation({
    mutationFn: async () => ask({ data: { prompt: q, mode: "health" } }),
    onSuccess: (r) => setAnswer(r.answer),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="font-display text-4xl text-gradient-sakura">Health</h1>
        <p className="text-sm text-muted-foreground">Look up supplements, vitamins, drugs & general medical info.</p>
      </header>

      <Card className="glass">
        <CardHeader><CardTitle className="font-display">Ask Sakura</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            rows={3}
            placeholder="e.g. What does ashwagandha do? Or: ibuprofen dosage and risks."
            className="bg-card/60"
          />
          <Button onClick={() => mut.mutate()} disabled={!q.trim() || mut.isPending} className="bg-gradient-sakura text-primary-foreground shadow-sakura">
            {mut.isPending ? "Consulting…" : "Ask"}
          </Button>
        </CardContent>
      </Card>

      {answer && (
        <Card className="glass">
          <CardContent className="pt-6">
            <SakuraMarkdown>{answer}</SakuraMarkdown>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
