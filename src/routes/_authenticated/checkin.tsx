import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { submitCheckin } from "@/lib/checkin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/checkin")({ component: CheckinPage });

interface CheckinRow {
  id: string; day: string; reflection: string | null;
  schedule: Array<{ time: string; block: string }> | null;
  priorities: string[] | null; mood: string | null; energy: number | null;
}

function CheckinPage() {
  const qc = useQueryClient();
  const sub = useServerFn(submitCheckin);
  const [form, setForm] = useState({ day_summary: "", completed_text: "", problems_text: "", energy: 7, mood: "calm" });

  const { data: latest } = useQuery({
    queryKey: ["checkin-latest"],
    queryFn: async () => {
      const { data } = await supabase.from("checkins")
        .select("id,day,reflection,schedule,priorities,mood,energy")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data as CheckinRow | null;
    },
  });

  const mut = useMutation({
    mutationFn: async () => sub({ data: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["checkin-latest"] }); toast.success("Check-in saved. Sakura has reflected."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="font-display text-4xl text-gradient-sakura">Daily check-in</h1>
        <p className="text-sm text-muted-foreground">Tell Sakura about your day. She will reflect and plan tomorrow.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass">
          <CardHeader><CardTitle className="font-display">How was today, Master?</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Day summary</Label>
              <Textarea value={form.day_summary} onChange={(e) => setForm({ ...form, day_summary: e.target.value })} rows={3} className="mt-1 bg-card/60" />
            </div>
            <div>
              <Label>What you completed</Label>
              <Textarea value={form.completed_text} onChange={(e) => setForm({ ...form, completed_text: e.target.value })} rows={3} className="mt-1 bg-card/60" />
            </div>
            <div>
              <Label>Problems / blockers</Label>
              <Textarea value={form.problems_text} onChange={(e) => setForm({ ...form, problems_text: e.target.value })} rows={3} className="mt-1 bg-card/60" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Energy (1–10)</Label>
                <Input type="number" min={1} max={10} value={form.energy} onChange={(e) => setForm({ ...form, energy: Number(e.target.value) })} className="mt-1" />
              </div>
              <div>
                <Label>Mood</Label>
                <Input value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} className="mt-1" />
              </div>
            </div>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="w-full bg-gradient-sakura text-primary-foreground shadow-sakura">
              {mut.isPending ? "Sakura is reflecting…" : "Submit to Sakura"}
            </Button>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader><CardTitle className="font-display">Sakura's reflection</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!latest && <p className="text-sm text-muted-foreground">No check-ins yet.</p>}
            {latest && (
              <>
                <p className="text-sm leading-relaxed">{latest.reflection}</p>
                {latest.priorities && latest.priorities.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Tomorrow's priorities</h4>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {latest.priorities.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
                {latest.schedule && latest.schedule.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Tomorrow's schedule</h4>
                    <div className="max-h-80 overflow-y-auto rounded-lg border border-border/60">
                      <table className="w-full text-sm">
                        <tbody>
                          {latest.schedule.map((s, i) => (
                            <tr key={i} className="border-b border-border/40 last:border-0">
                              <td className="w-16 px-3 py-1.5 text-primary">{s.time}</td>
                              <td className="px-3 py-1.5">{s.block}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
