import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams ElevenLabs TTS audio (Rachel voice) back to the browser as MP3.
 * Server-side proxy so the API key never reaches the client.
 */
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel
const ELEVEN_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=mp3_44100_128`;

export const Route = createFileRoute("/api/voice/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.ELEVENLABS_API_KEY;
        if (!key) return new Response("ELEVENLABS_API_KEY not configured", { status: 500 });

        let body: { text?: string };
        try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
        const text = (body.text ?? "").toString().trim().slice(0, 4500);
        if (!text) return new Response("Missing text", { status: 400 });

        const res = await fetch(ELEVEN_URL, {
          method: "POST",
          headers: {
            "xi-api-key": key,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2",
            voice_settings: {
              stability: 0.4,
              similarity_boost: 0.8,
              style: 0.5,
              use_speaker_boost: true,
            },
          }),
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
          return new Response(`ElevenLabs error ${res.status}: ${errText.slice(0, 300)}`, { status: 502 });
        }

        return new Response(res.body, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
