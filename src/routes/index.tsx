import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SakuraLogo } from "@/components/SakuraLogo";
import { PetalRain } from "@/components/PetalRain";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const nav = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/chat" });
      else setChecking(false);
    });
  }, [nav]);

  if (checking) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">…</div>;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PetalRain count={18} />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <SakuraLogo size={84} spin />
        <h1 className="mt-6 font-display text-6xl md:text-7xl">
          <span className="text-gradient-sakura">Sakura</span>
        </h1>
        <p className="mt-3 font-display text-xl text-muted-foreground italic">your most trusted personal AI manager</p>
        <p className="mt-6 max-w-xl text-sm text-muted-foreground">
          A private space for thought, plans, advice and reflection — invite-only. Sakura always addresses you as Master.
        </p>
        <div className="mt-10 flex gap-3">
          <Button asChild size="lg" className="bg-gradient-sakura text-primary-foreground shadow-sakura">
            <Link to="/login">Enter the garden</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
