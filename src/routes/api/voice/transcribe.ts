import { createFileRoute } from "@tanstack/react-router";

/**
 * Receives an audio blob (multipart form field "file") and transcribes it
 * with Groq's whisper-large-v3-turbo. Server-side so the key stays secret.
 */
export const Route = createFileRoute("/api/voice/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.GROQ_API_KEY;
        if (!key) return new Response("GROQ_API_KEY not configured", { status: 500 });

        let inForm: FormData;
        try { inForm = await request.formData(); } catch { return new Response("Invalid form data", { status: 400 }); }
        const file = inForm.get("file");
        if (!(file instanceof Blob)) return new Response("Missing file", { status: 400 });
        if (file.size > 25 * 1024 * 1024) return new Response("Audio too large", { status: 413 });

        const outForm = new FormData();
        // Groq requires a filename with a recognized extension
        const filename = (file as File).name || "speech.webm";
        outForm.append("file", file, filename);
        outForm.append("model", "whisper-large-v3-turbo");
        outForm.append("language", "en");
        outForm.append("response_format", "json");
        outForm.append("temperature", "0");

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: outForm,
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          return new Response(`Groq error ${res.status}: ${txt.slice(0, 300)}`, { status: 502 });
        }
        const data = (await res.json()) as { text?: string };
        return Response.json({ text: (data.text ?? "").trim() });
      },
    },
  },
});
