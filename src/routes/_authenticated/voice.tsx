import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, MicOff, Mic, History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SakuraLogo } from "@/components/SakuraLogo";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  deleteVoiceSession,
  getVoiceUserName,
  listVoiceSessions,
  saveVoiceSession,
  voiceReply,
} from "@/lib/voice.functions";
import { useSakuraSpeech, useVoiceCapture } from "@/lib/use-voice";

export const Route = createFileRoute("/_authenticated/voice")({
  component: VoicePage,
});

type Turn = { role: "user" | "assistant"; content: string };
type Phase = "idle" | "greeting" | "listening" | "thinking" | "speaking";

function VoicePage() {
  const [active, setActive] = useState(false);
  return (
    <div className="flex h-full flex-col">
      {active ? (
        <ImmersiveVoice onExit={() => setActive(false)} />
      ) : (
        <VoiceLanding onStart={() => setActive(true)} />
      )}
    </div>
  );
}

/* -------------------- landing + history -------------------- */

function VoiceLanding({ onStart }: { onStart: () => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listVoiceSessions);
  const del = useServerFn(deleteVoiceSession);
  const { data: sessions } = useQuery({ queryKey: ["voice-sessions"], queryFn: () => list({ data: undefined }) });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-sessions"] }),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-primary/20 bg-card/40 p-10 text-center shadow-sakura">
        <div className="relative">
          <span className="absolute inset-0 -m-6 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative sakura-breathe"><SakuraLogo size={120} /></div>
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-4xl text-gradient-sakura">Talk to Sakura</h1>
          <p className="text-muted-foreground">Real-time voice with ElevenLabs Rachel · Whisper transcription</p>
        </div>
        <Button onClick={onStart} size="lg" className="bg-gradient-sakura px-8 text-primary-foreground shadow-sakura">
          <Mic className="mr-2 h-5 w-5" /> Start voice conversation
        </Button>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" /> Voice history
        </div>
        <div className="space-y-2">
          {(sessions ?? []).length === 0 && (
            <p className="rounded-lg border border-border/40 bg-card/30 p-4 text-sm text-muted-foreground">
              No past voice sessions yet.
            </p>
          )}
          {(sessions ?? []).map((s) => (
            <details key={s.id} className="group rounded-lg border border-border/40 bg-card/30 p-3">
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span className="truncate font-medium">{s.title}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleString()}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.preventDefault(); delMut.mutate(s.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-sm">
                {s.transcript.map((t, i) => (
                  <p key={i} className={t.role === "user" ? "text-foreground" : "text-primary"}>
                    <span className="mr-2 text-xs uppercase text-muted-foreground">{t.role === "user" ? "You" : "Sakura"}</span>
                    {t.content}
                  </p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------- immersive conversation -------------------- */

function ImmersiveVoice({ onExit }: { onExit: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const reply = useServerFn(voiceReply);
  const save = useServerFn(saveVoiceSession);
  const getName = useServerFn(getVoiceUserName);

  const [phase, setPhase] = useState<Phase>("greeting");
  const [interimUser, setInterimUser] = useState("");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(false);
  const [name, setName] = useState("Master");
  const exitingRef = useRef(false);
  const transcriptRef = useRef<Turn[]>([]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  const { speak, stop: stopSpeak, speaking } = useSakuraSpeech();
  const speakingRef = useRef(false);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);

  const cap = useVoiceCapture({
    active: !muted,
    silenceMs: 2500,
    speechThreshold: 0.045,
    onSpeechStart: () => {
      if (speakingRef.current) {
        stopSpeak();
        setPhase("listening");
      }
    },
    onTranscript: (text) => {
      handleUserUtterance(text);
    },
    onError: (e) => {
      console.error(e);
      toast.error(e.message || "Microphone error");
    },
  });

  // Greeting on mount
  useEffect(() => {
    exitingRef.current = false;
    (async () => {
      try {
        const r = await getName({ data: undefined });
        setName(r.name);
        const greeting = `Hello Master ${r.name}, I'm ready to talk. What's on your mind?`;
        setTranscript([{ role: "assistant", content: greeting }]);
        setPhase("greeting");
        await speak(greeting, {
          onStart: () => setPhase("speaking"),
          onEnd: () => {
            if (exitingRef.current) return;
            setPhase("listening");
            cap.resume();
          },
        });
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      exitingRef.current = true;
      stopSpeak();
      // Persist if there was real interaction
      const t = transcriptRef.current;
      if (t.length > 1) {
        save({ data: { transcript: t } }).then(() => {
          qc.invalidateQueries({ queryKey: ["voice-sessions"] });
        }).catch(() => { /* ignore */ });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUserUtterance(text: string) {
    setInterimUser("");
    const lower = text.toLowerCase();

    // Stop / wait → interrupt only (no LLM call)
    if (/^(stop|wait|pause|hold on|shh|shush)[.!,]?$/i.test(lower.trim())) {
      stopSpeak();
      setPhase("listening");
      cap.resume();
      return;
    }

    setTranscript((prev) => [...prev, { role: "user", content: text }]);

    // Goodbye → farewell + exit
    if (/\bgood\s*bye\b.*\bsakura\b|\bsakura\b.*\bgood\s*bye\b|^bye\s+sakura/i.test(lower)) {
      setPhase("speaking");
      const farewell = `Goodbye, Master ${name}. I'm here whenever you need me.`;
      setTranscript((prev) => [...prev, { role: "assistant", content: farewell }]);
      await speak(farewell, {
        onStart: () => setPhase("speaking"),
        onEnd: () => exitImmersive(),
      });
      return;
    }

    setPhase("thinking");
    try {
      const r = await reply({ data: { message: text, history: transcriptRef.current.slice(-20) } });
      if (exitingRef.current) return;
      setTranscript((prev) => [...prev, { role: "assistant", content: r.reply }]);
      setPhase("speaking");
      await speak(r.reply, {
        onStart: () => setPhase("speaking"),
        onEnd: () => {
          if (exitingRef.current) return;
          setPhase("listening");
          cap.resume();
        },
      });
    } catch (e) {
      toast.error((e as Error).message);
      setPhase("listening");
      cap.resume();
    }
  }

  function exitImmersive() {
    if (exitingRef.current) return;
    exitingRef.current = true;
    stopSpeak();
    onExit();
  }

  const phaseLabel = useMemo(() => {
    switch (phase) {
      case "greeting":  return "Saying hello…";
      case "listening": return "Listening…";
      case "thinking":  return "Thinking…";
      case "speaking":  return "Sakura is speaking…";
      default:          return "";
    }
  }, [phase]);

  const countdownRingPct =
    phase === "listening" && cap.state === "recording"
      ? 1 - cap.silenceRemainingMs / 2500
      : 0;

  return (
    <div
      className="relative flex h-[calc(100vh-3rem)] w-full flex-col items-center justify-between overflow-hidden px-6 py-8 text-center"
      style={{ background: "linear-gradient(180deg, #1a1a2e 0%, #14142a 60%, #1a1a2e 100%)" }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]" />
      </div>

      <div className="z-10 flex w-full items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="text-white/70 hover:bg-white/10 hover:text-white"
          onClick={() => setMuted((m) => !m)}
          title={muted ? "Unmute mic" : "Mute mic"}
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={exitImmersive} title="Exit voice mode">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Avatar */}
      <div className="relative z-10 flex h-72 w-72 items-center justify-center">
        {phase === "speaking" && (
          <>
            <span className="sakura-ring" />
            <span className="sakura-ring delay-1" />
            <span className="sakura-ring delay-2" />
          </>
        )}
        {phase === "listening" && (
          <span
            className="absolute inset-0 rounded-full border border-primary/50 transition-transform duration-100"
            style={{ transform: `scale(${1 + cap.level * 0.7})`, opacity: 0.35 + cap.level * 0.55 }}
          />
        )}
        {countdownRingPct > 0 && (
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r="47" stroke="hsl(var(--primary) / 0.25)" strokeWidth="2" fill="none" />
            <circle
              cx="50" cy="50" r="47" fill="none"
              stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 47}
              strokeDashoffset={(1 - countdownRingPct) * 2 * Math.PI * 47}
            />
          </svg>
        )}
        <div className={`relative ${phase === "thinking" ? "sakura-spin" : "sakura-breathe"}`}>
          <SakuraLogo size={180} />
        </div>
      </div>

      <p className="z-10 font-display text-3xl text-gradient-sakura">
        {phaseLabel}
        {phase === "thinking" && (
          <span className="ml-2 inline-flex gap-1 align-middle">
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: "0.15s" }} />
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: "0.3s" }} />
          </span>
        )}
      </p>

      {/* Transcript */}
      <div className="z-10 w-full max-w-2xl">
        <ScrollArea className="h-40 rounded-lg border border-white/10 bg-black/20 p-3 text-left">
          <div className="space-y-2 text-sm">
            {transcript.slice(-8).map((t, i) => (
              <p key={i} className={t.role === "user" ? "text-white/90" : "text-primary"}>
                <span className="mr-2 text-[10px] uppercase text-white/40">{t.role === "user" ? "You" : "Sakura"}</span>
                {t.content}
              </p>
            ))}
            {interimUser && (
              <p className="italic text-white/60">"{interimUser}"</p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Waveform */}
      <div className="z-10 flex h-16 items-center gap-1.5">
        {Array.from({ length: 28 }).map((_, i) => {
          const base = Math.sin((i / 28) * Math.PI) * 0.7 + 0.3;
          const lvl = phase === "listening" || phase === "speaking" ? cap.level : 0.05;
          const h = Math.max(6, lvl * 64 * base + (1 - lvl) * 6 * base);
          return (
            <span
              key={i}
              className="w-1 rounded-full bg-gradient-to-t from-primary/30 to-primary transition-all duration-100"
              style={{ height: `${h}px` }}
            />
          );
        })}
      </div>

      <p className="z-10 text-xs text-white/40">
        Say "goodbye Sakura" to end · "stop" to interrupt
      </p>
    </div>
  );
}
