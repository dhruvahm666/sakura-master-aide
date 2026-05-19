import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format, startOfWeek, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { generateWeeklyPlan } from "@/lib/planner.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/planner")({ component: PlannerPage });

const CAT_COLORS: Record<string, string> = {
  study: "bg-blue-500/30 text-blue-100 border-blue-400/30",
  work: "bg-violet-500/30 text-violet-100 border-violet-400/30",
  meeting: "bg-amber-500/30 text-amber-100 border-amber-400/30",
  party: "bg-pink-500/30 text-pink-100 border-pink-400/30",
  vacation: "bg-teal-500/30 text-teal-100 border-teal-400/30",
  health: "bg-emerald-500/30 text-emerald-100 border-emerald-400/30",
  other: "bg-slate-500/30 text-slate-100 border-slate-400/30",
};

interface EvtRow { id: string; title: string; category: string; start_at: string; end_at: string; notes: string | null }

function PlannerPage() {
  const qc = useQueryClient();
  const [goals, setGoals] = useState("");
  const gen = useServerFn(generateWeeklyPlan);
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);

  const { data: events } = useQuery({
    queryKey: ["planner", weekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planner_events").select("id,title,category,start_at,end_at,notes")
        .gte("start_at", weekStart.toISOString()).lt("start_at", weekEnd.toISOString())
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EvtRow[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => gen({ data: { goals, weekStart: format(weekStart, "yyyy-MM-dd") } }),
    onSuccess: (r) => { toast.success(`Sakura planned ${r.inserted} events.`); qc.invalidateQueries({ queryKey: ["planner"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-gradient-sakura">Weekly planner</h1>
          <p className="text-sm text-muted-foreground">Week of {format(weekStart, "MMM d, yyyy")}</p>
        </div>
      </header>

      <Card className="glass">
        <CardHeader><CardTitle className="font-display">Tell Sakura your goals</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            rows={3}
            placeholder="e.g. Ship the new feature, train 4×, deep work on essay, dinner with Aria…"
            className="bg-card/60"
          />
          <Button onClick={() => mut.mutate()} disabled={!goals.trim() || mut.isPending} className="bg-gradient-sakura text-primary-foreground shadow-sakura">
            {mut.isPending ? "Sakura is planning…" : "Generate weekly plan"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const dayEvents = (events ?? []).filter((e) => new Date(e.start_at).toDateString() === d.toDateString());
          return (
            <Card key={d.toISOString()} className="glass min-h-[200px]">
              <CardHeader className="p-3">
                <CardTitle className="text-sm">
                  <div className="text-xs text-muted-foreground">{format(d, "EEE")}</div>
                  <div className="text-lg">{format(d, "MMM d")}</div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                {dayEvents.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
                {dayEvents.map((e) => (
                  <div key={e.id} className={`rounded-md border px-2 py-1.5 text-xs ${CAT_COLORS[e.category] ?? CAT_COLORS.other}`}>
                    <div className="font-medium">{e.title}</div>
                    <div className="opacity-80">{format(new Date(e.start_at), "HH:mm")}–{format(new Date(e.end_at), "HH:mm")}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
