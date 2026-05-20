import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Mic, MicOff, Volume2, VolumeX, Square, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendChatMessage } from "@/lib/chat.functions";
import { SakuraMarkdown } from "@/components/SakuraMarkdown";
import { SakuraLogo } from "@/components/SakuraLogo";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMic, useSakuraSpeech, useTtsEnabled, useVoiceSpeed } from "@/lib/use-voice";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ThreadView,
});

interface Msg { id: string; role: "user" | "assistant"; content: string; created_at: string }

function ThreadView() {
  const { threadId } = Route.useParams();
  const qc = useQueryClient();
  const send = useServerFn(sendChatMessage);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { enabled: ttsOn, toggle: toggleTts } = useTtsEnabled();
  const { speak, stop: stopSpeak, speaking } = useSakuraSpeech();
  const { speed } = useVoiceSpeed();
  const lastSpokenId = useRef<string | null>(null);

  const { data: messages } = useQuery({
    queryKey: ["messages", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages").select("id,role,content,created_at")
        .eq("thread_id", threadId).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const mut = useMutation({
    mutationFn: async (content: string) => send({ data: { threadId, content, mode: "chat" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", threadId] });
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mic = useMic({ onFinal: (t) => setInput((prev) => (prev ? prev + " " : "") + t) });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mut.isPending]);

  // Auto-speak newest assistant message when TTS is on
  useEffect(() => {
    if (!ttsOn || !messages?.length) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;
    if (lastSpokenId.current === last.id) return;
    lastSpokenId.current = last.id;
    speak(last.content, { speed });
  }, [messages, ttsOn, speak, speed]);

  function onSend() {
    const text = input.trim();
    if (!text || mut.isPending) return;
    setInput("");
    if (mic.listening) mic.stop();
    mut.mutate(text);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-1 border-b border-border/40 px-3 py-1.5">
        <Button asChild size="sm" className="bg-gradient-sakura text-primary-foreground shadow-sakura" title="Start voice conversation">
          <Link to="/chat/$threadId/voice" params={{ threadId }}>
            <Headphones className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">Voice Mode</span>
          </Link>
        </Button>
        {speaking && (
          <Button size="sm" variant="ghost" onClick={stopSpeak} title="Stop speaking">
            <Square className="h-4 w-4 text-primary" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={toggleTts} title={ttsOn ? "Mute Sakura" : "Let Sakura speak"}>
          {ttsOn ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4" />}
        </Button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-10">
        <div className="mx-auto max-w-3xl space-y-5">
          {(messages ?? []).length === 0 && !mut.isPending && (
            <div className="flex flex-col items-center py-12 text-center">
              <SakuraLogo size={48} spin />
              <p className="mt-4 font-display text-2xl text-gradient-sakura">How may I serve you, Master?</p>
            </div>
          )}
          {(messages ?? []).map((m) => (
            <div key={m.id} className={`animate-msg flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <SakuraLogo size={28} className="mr-3 mt-1 shrink-0" />}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-primary/15 text-foreground" : "glass"}`}>
                {m.role === "assistant" ? <SakuraMarkdown>{m.content}</SakuraMarkdown> : <p className="whitespace-pre-wrap text-sm">{m.content}</p>}
                {m.role === "assistant" && (
                  <button onClick={() => speak(m.content)} className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
                    <Volume2 className="h-3 w-3" /> Speak
                  </button>
                )}
              </div>
            </div>
          ))}
          {mut.isPending && (
            <div className="flex">
              <SakuraLogo size={28} className="mr-3 mt-1" spin />
              <div className="glass max-w-[85%] rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                Sakura is composing your response…
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-border/60 bg-background/60 p-3 backdrop-blur md:p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          {mic.supported && (
            <Button
              type="button"
              onClick={mic.toggle}
              variant={mic.listening ? "default" : "outline"}
              className={`h-[52px] w-[52px] shrink-0 p-0 ${mic.listening ? "bg-destructive hover:bg-destructive/90 animate-pulse" : ""}`}
              title={mic.listening ? "Stop listening" : "Speak to Sakura"}
            >
              {mic.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={mic.listening ? "Listening…" : "Speak with Sakura…"}
            className="min-h-[52px] max-h-40 resize-none bg-card/60"
          />
          <Button onClick={onSend} disabled={mut.isPending} className="h-[52px] bg-gradient-sakura text-primary-foreground shadow-sakura">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
