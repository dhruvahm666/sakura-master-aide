import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

interface Profile { display_name: string; avatar_url: string | null; timezone: string }

function ProfilePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Profile>({ display_name: "", avatar_url: "", timezone: "Asia/Kolkata" });
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("display_name,avatar_url,timezone").maybeSingle();
      return data as Profile | null;
    },
  });

  useEffect(() => {
    if (data) setForm({ display_name: data.display_name, avatar_url: data.avatar_url ?? "", timezone: data.timezone });
  }, [data]);

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { error } = await supabase.from("profiles").update({
      display_name: form.display_name || "Master",
      avatar_url: form.avatar_url || null,
      timezone: form.timezone || "Asia/Kolkata",
    }).eq("user_id", u.user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Profile saved."); qc.invalidateQueries({ queryKey: ["profile"] }); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="font-display text-4xl text-gradient-sakura">Profile</h1>
        <p className="text-sm text-muted-foreground">How Sakura knows you.</p>
      </header>
      <Card className="glass">
        <CardHeader><CardTitle className="font-display">Your details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/40" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-sakura text-2xl font-display text-primary-foreground">
                {(form.display_name || "M").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <Label>Avatar URL</Label>
              <Input value={form.avatar_url ?? ""} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} className="mt-1" placeholder="https://…" />
            </div>
          </div>
          <div>
            <Label>Display name (Sakura calls you "Master {form.display_name || "…"}")</Label>
            <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Timezone</Label>
            <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="mt-1" placeholder="Asia/Kolkata" />
          </div>
          <Button onClick={save} disabled={saving} className="bg-gradient-sakura text-primary-foreground shadow-sakura">
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
