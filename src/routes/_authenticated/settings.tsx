import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, Trash2, Send, Check, Clock, XCircle } from "lucide-react";
import { whoAmI } from "@/lib/invites.functions";
import { createUserInvite, listUserInvites, revokeUserInvite } from "@/lib/user-invites.functions";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const who = useServerFn(whoAmI);
  const create = useServerFn(createUserInvite);
  const list = useServerFn(listUserInvites);
  const revoke = useServerFn(revokeUserInvite);

  const [email, setEmail] = useState("");

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["whoami"],
    queryFn: () => who({ data: undefined }),
  });

  const isAdmin = me?.role === "admin";

  const { data } = useQuery({
    queryKey: ["user_invites"],
    queryFn: () => list({ data: undefined }),
    enabled: !!isAdmin,
  });

  const mut = useMutation({
    mutationFn: async () =>
      create({ data: { email, origin: window.location.origin } }),
    onSuccess: (res) => {
      toast.success(`Invite sent to ${res.email}, Master.`, {
        description: res.emailQueued
          ? "An email has been queued for delivery."
          : "Email delivery isn't set up yet — copy the invite link below to share manually.",
      });
      navigator.clipboard?.writeText(res.link).catch(() => {});
      setEmail("");
      qc.invalidateQueries({ queryKey: ["user_invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (meLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) {
    nav({ to: "/chat" });
    return null;
  }

  const invites = data?.invites ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="font-display text-4xl text-gradient-sakura">Settings</h1>
        <p className="text-sm text-muted-foreground">Owner-only controls for Sakura's garden.</p>
      </header>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2"><Send className="h-5 w-5" /> Invite User</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="mt-1"
            />
          </div>
          <Button
            onClick={() => mut.mutate()}
            disabled={!email || mut.isPending}
            className="bg-gradient-sakura text-primary-foreground shadow-sakura"
          >
            {mut.isPending ? "Sending…" : "Send Invite"}
          </Button>
          <p className="text-xs text-muted-foreground">Invites expire after 7 days. The link is copied to your clipboard automatically.</p>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader><CardTitle className="font-display">Sent invites</CardTitle></CardHeader>
        <CardContent>
          {invites.length === 0 && (
            <p className="text-sm text-muted-foreground">No invites yet, Master.</p>
          )}
          <ul className="divide-y divide-border/40">
            {invites.map((i) => {
              const expired = !i.used_at && new Date(i.expires_at) < new Date();
              const status = i.used_at
                ? { label: "Accepted", color: "text-emerald-400", icon: <Check className="h-3.5 w-3.5" /> }
                : expired
                  ? { label: "Expired", color: "text-destructive", icon: <XCircle className="h-3.5 w-3.5" /> }
                  : { label: "Pending", color: "text-amber-400", icon: <Clock className="h-3.5 w-3.5" /> };
              const link = `${window.location.origin}/login?invite=${encodeURIComponent(i.code)}&email=${encodeURIComponent(i.email)}`;
              return (
                <li key={i.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{i.email}</div>
                    <div className={`flex items-center gap-1.5 text-xs ${status.color}`}>
                      {status.icon} {status.label}
                      <span className="text-muted-foreground">
                        · sent {new Date(i.created_at).toLocaleDateString()}
                        {i.used_at && ` · accepted ${new Date(i.used_at).toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard?.writeText(link);
                        toast.success("Invite link copied.");
                      }}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy link
                    </Button>
                    {!i.used_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await revoke({ data: { id: i.id } });
                          qc.invalidateQueries({ queryKey: ["user_invites"] });
                          toast.success("Invite revoked.");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
