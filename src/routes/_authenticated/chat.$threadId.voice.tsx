import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, X, Square } from "lucide-react";
import { sendChatMessage } from "@/lib/chat.functions";
import { SakuraLogo } from "@/components/SakuraLogo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMic, useSakuraSpeech } from "@/lib/use-voice";

export const Route = createFileRoute("/_authenticated/chat/$threadId/voice")({
  component: VoiceMode,
});

function VoiceMode() {
  const { threadId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const send = useServerFn(sendChatMessage);
  const { speak, stop: stopSpeak, speaking } = useSakuraSpeech();
  const [interim, setInterim] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [lastReply, setLastReply] = useState<string>("");
  const autoLoop = useRef(true);

  const mut = useMutation({
    mutationFn: async (content: string) => send({ data: { threadId, content, mode: "chat" } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["messages", threadId] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      setLastReply(r.assistant);
      setStatus("speaking");
      speak(r.assistant);
    },
    onError: (e: Error) => { toast.error(e.message); setStatus("idle"); },
  });

  const mic = useMic({
    continuous: false,
    onInterim: setInterim,
    onFinal: (text) => {
      setInterim("");
      if (!text.trim()) return;
      setStatus("thinking");
      mut.mutate(text);
    },
  });

  // After Sakura finishes speaking, auto-listen again
  useEffect(() => {
    if (status === "speaking" && !speaking) {
      setStatus("idle");
      if (autoLoop.current && !mic.listening) {
        setTimeout(() => mic.start(), 400);
      }
    }
  }, [speaking, status, mic]);

  useEffect(() => {
    if (mic.listening) setStatus("listening");
  }, [mic.listening]);

  function exit() {
    autoLoop.current = false;
    mic.stop();
    stopSpeak();
    nav({ to: "/chat/$threadId", params: { threadId } });
  }

  const statusText = {
    idle: "Tap the petal to begin",
    listening: "Listening…",
    thinking: "Sakura is thinking…",
    speaking: "Sakura is speaking…",
  }[status];

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-background via-background to-primary/5 px-6 text-center">
      <Button asChild variant="ghost" size="sm" className="absolute right-4 top-4" onClick={exit}>
        <Link to="/chat/$threadId" params={{ threadId }}><X className="h-4 w-4" /></Link>
      </Button>

      <div className="relative">
        <div className={`absolute inset-0 rounded-full bg-primary/20 blur-3xl transition-all ${status === "listening" ? "scale-150 animate-pulse" : status === "speaking" ? "scale-125" : "scale-100"}`} />
        <div className={`relative ${status === "speaking" ? "animate-spin-slow" : ""}`}>
          <SakuraLogo size={140} />
        </div>
      </div>

      <p className="mt-10 font-display text-2xl text-gradient-sakura">{statusText}</p>
      {interim && <p className="mt-2 max-w-md text-sm italic text-muted-foreground">"{interim}"</p>}
      {lastReply && status !== "thinking" && (
        <p className="mt-6 max-w-xl text-sm text-muted-foreground line-clamp-4">{lastReply}</p>
      )}

      <div className="mt-10 flex items-center gap-3">
        {speaking ? (
          <Button onClick={stopSpeak} variant="outline" size="lg" className="h-16 w-16 rounded-full p-0">
            <Square className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            onClick={mic.toggle}
            disabled={mut.isPending}
            size="lg"
            className={`h-20 w-20 rounded-full p-0 shadow-sakura ${mic.listening ? "bg-destructive hover:bg-destructive/90 animate-pulse" : "bg-gradient-sakura text-primary-foreground"}`}
          >
            {mic.listening ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
          </Button>
        )}
      </div>

      {!mic.supported && (
        <p className="mt-6 text-xs text-destructive">Speech recognition isn't supported in this browser.</p>
      )}
    </div>
  );
}
