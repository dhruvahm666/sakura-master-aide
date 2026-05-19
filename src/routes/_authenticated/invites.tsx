import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { inviteEmail, listInvites } from "@/lib/invites.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/invites")({ component: InvitesPage });

function InvitesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listInvites);
  const inv = useServerFn(inviteEmail);
  const [email, setEmail] = useState("");

  const { data } = useQuery({ queryKey: ["invites"], queryFn: () => list({ data: undefined }) });
  const mut = useMutation({
    mutationFn: async () => inv({ data: { email } }),
    onSuccess: () => { toast.success(`${email} invited.`); setEmail(""); qc.invalidateQueries({ queryKey: ["invites"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (data && !data.isAdmin) {
    nav({ to: "/chat" });
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="font-display text-4xl text-gradient-sakura">Invites</h1>
        <p className="text-sm text-muted-foreground">Allow new users into Sakura's garden.</p>
      </header>
      <Card className="glass">
        <CardHeader><CardTitle className="font-display">Invite a new user</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={() => mut.mutate()} disabled={!email || mut.isPending} className="bg-gradient-sakura text-primary-foreground shadow-sakura">
            Invite
          </Button>
        </CardContent>
      </Card>
      <Card className="glass">
        <CardHeader><CardTitle className="font-display">Allowlist</CardTitle></CardHeader>
        <CardContent>
          {(data?.invites ?? []).length === 0 && <p className="text-sm text-muted-foreground">No invites yet.</p>}
          <ul className="divide-y divide-border/40">
            {(data?.invites ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <span>{i.email}</span>
                <span className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
