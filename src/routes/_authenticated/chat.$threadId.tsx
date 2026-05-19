import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendChatMessage } from "@/lib/chat.functions";
import { SakuraMarkdown } from "@/components/SakuraMarkdown";
import { SakuraLogo } from "@/components/SakuraLogo";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mut.isPending]);

  function onSend() {
    const text = input.trim();
    if (!text || mut.isPending) return;
    setInput("");
    mut.mutate(text);
  }

  return (
    <div className="flex h-full flex-col">
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
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="Speak with Sakura…"
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
