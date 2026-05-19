import { useEffect, useRef } from "react";
import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createThread, deleteThread } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatLayout,
});

interface Thread { id: string; title: string; updated_at: string }

function ChatLayout() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);
  const lastAutoCreate = useRef(false);

  const { data: threads } = useQuery({
    queryKey: ["threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_threads").select("id,title,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Thread[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => create({ data: undefined }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      nav({ to: "/chat/$threadId", params: { threadId: r.id } });
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["threads"] }); toast.success("Conversation removed."); },
  });

  // Auto-redirect into newest thread if at /chat root
  useEffect(() => {
    if (path === "/chat" && threads && threads.length > 0 && !lastAutoCreate.current) {
      nav({ to: "/chat/$threadId", params: { threadId: threads[0].id }, replace: true });
    }
  }, [path, threads, nav]);

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border/60 bg-sidebar/30 md:flex">
        <div className="flex items-center justify-between p-3">
          <h2 className="font-display text-lg">Conversations</h2>
          <Button size="sm" variant="ghost" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {(threads ?? []).map((t) => {
            const active = path.endsWith(t.id);
            return (
              <div key={t.id} className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition ${active ? "bg-primary/15 text-foreground" : "hover:bg-sidebar-accent/60 text-muted-foreground"}`}>
                <Link to="/chat/$threadId" params={{ threadId: t.id }} className="flex-1 truncate">
                  {t.title || "Untitled"}
                </Link>
                <button
                  onClick={() => { if (confirm("Delete this conversation?")) delMut.mutate(t.id); }}
                  className="opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })}
          {(threads ?? []).length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">No conversations yet. Start a new one above.</p>
          )}
        </div>
      </aside>
      <div className="flex-1 overflow-hidden">
        {path === "/chat" ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <h2 className="font-display text-3xl text-gradient-sakura">Good day, Master.</h2>
            <p className="max-w-md text-sm text-muted-foreground">Begin a new conversation with Sakura.</p>
            <Button onClick={() => createMut.mutate()} className="bg-gradient-sakura text-primary-foreground">
              <Plus className="mr-1 h-4 w-4" /> New conversation
            </Button>
          </div>
        ) : <Outlet />}
      </div>
    </div>
  );
}
