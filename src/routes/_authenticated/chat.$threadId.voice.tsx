import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

/**
 * The thread-scoped voice page has been replaced by the standalone /voice
 * page. Redirect users immediately.
 */
export const Route = createFileRoute("/_authenticated/chat/$threadId/voice")({
  component: VoiceRedirect,
});

function VoiceRedirect() {
  const nav = useNavigate();
  useEffect(() => { nav({ to: "/voice", replace: true }); }, [nav]);
  return null;
}
