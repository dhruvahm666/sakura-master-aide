import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Mic } from "lucide-react";
import { sendChatMessage } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { SakuraLogo } from "@/components/SakuraLogo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useContinuousMic,
  useSakuraSpeech,
  useMicLevel,
  useVoiceSpeed,
} from "@/lib/use-voice";

export const Route = createFileRoute("/_authenticated/chat/$threadId/voice")({
  component: VoiceMode,
});

type Status = "idle" | "greeting" | "listening" | "thinking" | "speaking";

function VoiceMode() {
  const { threadId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const send = useServerFn(sendChatMessage);
  const { speak, stop: stopSpeak, speaking } = useSakuraSpeech();
  const { speed } = useVoiceSpeed();

  const [interim, setInterim] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [status, setStatus] = useState<Status>("greeting");
  const exitingRef = useRef(false);
  const speakingRef = useRef(false);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);

  const { data: profile } = useQuery({
    queryKey: ["profile-voice"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name").maybeSingle();
      return data as { display_name: string } | null;
    },
  });
  const name = profile?.display_name ?? "Master";

  const mut = useMutation({
    mutationFn: async (content: string) => send({ data: { threadId, content, mode: "chat" } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["messages", threadId] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      setLastReply(r.assistant);
      setStatus("speaking");
      speak(r.assistant, {
        speed,
        onEnd: () => {
          if (exitingRef.current) return;
          setStatus("listening");
        },
      });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setStatus("listening");
    },
  });

  const mic = useContinuousMic({
    silenceMs: 1500,
    onInterim: (t) => setInterim(t),
    onSpeechStart: () => {
      // Interrupt Sakura mid-sentence
      if (speakingRef.current) {
        stopSpeak();
        setStatus("listening");
      }
    },
    onCommit: (text) => {
      setInterim("");
      const trimmed = text.trim();
      if (!trimmed) return;

      // Goodbye phrase exits voice mode
      if (/\b(good\s*bye|goodbye)\b.*sakura|sakura.*\b(good\s*bye|goodbye)\b/i.test(trimmed)) {
        exit(true);
        return;
      }

      setStatus("thinking");
      mut.mutate(trimmed);
    },
  });

  // Boot: greet user then start listening
  useEffect(() => {
    exitingRef.current = false;
    const greeting = `I'm listening, Master ${name}.`;
    setStatus("greeting");
    speak(greeting, {
      speed,
      onEnd: () => {
        if (exitingRef.current) return;
        setStatus("listening");
        mic.start();
      },
    });
    return () => {
      exitingRef.current = true;
      mic.stop();
      stopSpeak();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Reflect mic.listening state into status (don't override thinking/speaking)
  useEffect(() => {
    if (mic.listening && status !== "thinking" && status !== "speaking" && status !== "greeting") {
      setStatus("listening");
    }
  }, [mic.listening, status]);

  function exit(withFarewell: boolean) {
    if (exitingRef.current) return;
    exitingRef.current = true;
    mic.stop();
    stopSpeak();
    const goNav = () => nav({ to: "/chat/$threadId", params: { threadId } });
    if (withFarewell) {
      // Speak farewell on a fresh hook outside this scope is messy — use speechSynthesis directly
      try {
        const u = new SpeechSynthesisUtterance(`Goodbye, Master ${name}. I'm here whenever you need me.`);
        u.rate = 1; u.pitch = 1.05;
        u.onend = goNav; u.onerror = goNav;
        window.speechSynthesis?.speak(u);
        setTimeout(goNav, 4000);
      } catch { goNav(); }
    } else {
      goNav();
    }
  }

  const micActive = status === "listening";
  const level = useMicLevel(micActive);

  const statusText = useMemo(() => {
    switch (status) {
      case "greeting":  return `Saying hello…`;
      case "listening": return `Listening, Master ${name}…`;
      case "thinking":  return `Thinking…`;
      case "speaking":  return `Sakura is speaking…`;
      default:          return `Tap the petal to begin`;
    }
  }, [status, name]);

  return (
    <div
      className="relative flex h-full min-h-[calc(100vh-3rem)] flex-col items-center justify-center overflow-hidden px-6 text-center"
      style={{ background: "linear-gradient(180deg, #1a1a2e 0%, #15152a 60%, #1a1a2e 100%)" }}
    >
      {/* Soft ambient blob */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => exit(false)}
        className="absolute right-4 top-4 z-20 text-white/70 hover:bg-white/10 hover:text-white"
        title="Exit voice mode"
      >
        <X className="h-5 w-5" />
      </Button>

      {/* Avatar with breathing + speaking rings */}
      <div className="relative z-10 flex h-64 w-64 items-center justify-center">
        {status === "speaking" && (
          <>
            <span className="sakura-ring" />
            <span className="sakura-ring delay-1" />
            <span className="sakura-ring delay-2" />
          </>
        )}
        {status === "listening" && (
          <span
            className="absolute inset-0 rounded-full border border-primary/40 transition-transform duration-150"
            style={{ transform: `scale(${1 + level * 0.6})`, opacity: 0.4 + level * 0.5 }}
          />
        )}
        <div className={`relative ${status === "thinking" ? "sakura-spin" : "sakura-breathe"}`}>
          <SakuraLogo size={160} />
        </div>
      </div>

      <p className="z-10 mt-10 font-display text-3xl text-gradient-sakura">
        {statusText}
        {status === "thinking" && (
          <span className="ml-2 inline-flex gap-1 align-middle">
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: "0.15s" }} />
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: "0.3s" }} />
          </span>
        )}
      </p>

      {interim && status === "listening" && (
        <p className="z-10 mt-3 max-w-xl text-base italic text-white/70">"{interim}"</p>
      )}
      {lastReply && (status === "speaking" || status === "listening") && (
        <p className="z-10 mt-6 max-w-2xl text-sm text-white/50 line-clamp-3">{lastReply}</p>
      )}

      {/* Waveform */}
      {status === "listening" && (
        <div className="z-10 mt-10 flex h-16 items-center gap-1.5">
          {Array.from({ length: 24 }).map((_, i) => {
            const base = Math.sin((i / 24) * Math.PI) * 0.7 + 0.3;
            const h = Math.max(6, level * 60 * base + (1 - level) * 6 * base);
            return (
              <span
                key={i}
                className="w-1 rounded-full bg-gradient-to-t from-primary/40 to-primary transition-all duration-100"
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>
      )}

      {!mic.supported && (
        <div className="z-10 mt-8 max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Speech recognition isn't supported in this browser. Try Chrome, Edge, or Safari.
        </div>
      )}

      {/* Manual restart if listening got stuck */}
      {status === "listening" && !mic.listening && (
        <Button
          onClick={mic.start}
          className="z-10 mt-6 rounded-full bg-gradient-sakura px-5 text-primary-foreground shadow-sakura"
        >
          <Mic className="mr-2 h-4 w-4" /> Resume listening
        </Button>
      )}

      <p className="z-10 mt-10 text-xs text-white/40">
        Say "goodbye Sakura" to end, or tap the X.
      </p>
    </div>
  );
}
