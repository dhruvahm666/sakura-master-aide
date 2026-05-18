/**
 * Server-only Groq client. Calls Groq's OpenAI-compatible chat completions.
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function groqChat(messages: GroqMessage[], opts?: { model?: string; temperature?: number; responseFormat?: "text" | "json_object" }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not configured.");

  const body: Record<string, unknown> = {
    model: opts?.model ?? "llama-3.3-70b-versatile",
    messages,
    temperature: opts?.temperature ?? 0.7,
  };
  if (opts?.responseFormat === "json_object") body.response_format = { type: "json_object" };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}
