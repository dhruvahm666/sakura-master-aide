import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { checkSignupAllowed } from "@/lib/invites.functions";
import { SakuraLogo } from "@/components/SakuraLogo";
import { PetalRain } from "@/components/PetalRain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const check = useServerFn(checkSignupAllowed);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success(`Welcome back, Master.`);
        nav({ to: "/chat" });
      } else {
        const allowed = await check({ data: { email } });
        if (!allowed.allowed) {
          throw new Error("This email is not invited. Sakura is invite-only.");
        }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/chat`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. You may sign in.");
        setMode("signin");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PetalRain count={10} />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <Link to="/" className="mb-6 flex items-center gap-3">
          <SakuraLogo size={44} />
          <span className="font-display text-3xl text-gradient-sakura">Sakura</span>
        </Link>
        <Card className="w-full glass p-6">
          <h1 className="font-display text-2xl">
            {mode === "signin" ? "Welcome back, Master" : "Step into the garden"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to continue your conversation." : "Sakura is invite-only — use the email you were invited with."}
          </p>
          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">How should Sakura address you?</Label>
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Aria" className="mt-1" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-gradient-sakura text-primary-foreground shadow-sakura">
              {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-sm text-muted-foreground hover:text-primary"
          >
            {mode === "signin" ? "Have an invite? Create your account →" : "Already have an account? Sign in"}
          </button>
        </Card>
      </div>
    </div>
  );
}
