import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const check = useServerFn(checkSignupAllowed);

  async function onGoogle() {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/chat`,
      });
      if (result.redirected) return;
      if (result.error) throw result.error;
      toast.success("Welcome, Master.");
      nav({ to: "/chat" });
    } catch (err) {
      toast.error(`Google sign-in failed: ${(err as Error).message}. Use email & password instead.`);
      setMode("signin");
    } finally {
      setGoogleLoading(false);
    }
  }


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("not confirmed") || msg.includes("confirm")) {
            throw new Error("Please confirm your email first, Master. Check your inbox.");
          }
          if (msg.includes("invalid") || msg.includes("credentials")) {
            throw new Error("Incorrect email or password, Master. Please try again. If you don't have an account yet, create one first.");
          }
          throw error;
        }
        toast.success(`Welcome back, Master.`);
        nav({ to: "/chat" });
      } else {

        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/chat`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) {
          if (error.message.toLowerCase().includes("registered")) {
            throw new Error("This email already has an account, Master. Try signing in instead.");
          }
          throw error;
        }
        toast.success("Check your email to confirm your account, Master.", { duration: 8000 });
        setMode("signin");
        setPassword("");
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
            {mode === "signin"
              ? "Sign in to continue. New here? Create your account below first, Master."
              : "Sakura is invite-only — use the email you were invited with. You'll receive a confirmation email."}
          </p>

          <Button
            type="button"
            onClick={onGoogle}
            disabled={googleLoading}
            variant="outline"
            className="mt-5 w-full gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6S6.9 20.8 12 20.8c6.9 0 9.5-4.8 9.5-7.3 0-.5 0-.9-.1-1.3H12z"/>
            </svg>
            {googleLoading ? "Opening Google…" : "Continue with Google"}
          </Button>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={onSubmit} className="space-y-3">

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
          <div className="mt-5 border-t border-border/60 pt-4">
            {mode === "signin" ? (
              <>
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  Don't have an account yet, Master?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setMode("signup"); setPassword(""); }}
                  className="w-full border-primary/50 text-primary hover:bg-primary/10"
                >
                  Create Account
                </Button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { setMode("signin"); setPassword(""); }}
                className="w-full text-sm text-muted-foreground hover:text-primary"
              >
                ← Already have an account? Sign in
              </button>
            )}
          </div>

        </Card>
      </div>
    </div>
  );
}
