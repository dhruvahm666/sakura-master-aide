import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    puter?: {
      ai: {
        txt2speech: (text: string, opts?: { voice?: string; engine?: string; language?: string }) => Promise<HTMLAudioElement>;
      };
    };
  }
}

const TTS_KEY = "sakura.ttsEnabled";

export function useTtsEnabled() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(TTS_KEY) === "1";
  });
  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v;
      localStorage.setItem(TTS_KEY, next ? "1" : "0");
      return next;
    });
  }, []);
  return { enabled, toggle, setEnabled };
}

/** Strip markdown / code / chart blocks before speaking. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/```chart[\s\S]*?```/g, " (chart shown) ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

export function useSakuraSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    try {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
    } catch { /* noop */ }
    setSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    const cleaned = cleanForSpeech(text);
    if (!cleaned || typeof window === "undefined" || !window.puter?.ai?.txt2speech) return;
    stop();
    try {
      setSpeaking(true);
      const audio = await window.puter.ai.txt2speech(cleaned, { engine: "neural", voice: "Joanna" });
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      await audio.play();
    } catch (e) {
      console.error("TTS failed", e);
      setSpeaking(false);
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);
  return { speak, stop, speaking };
}

export interface UseMicOpts {
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  continuous?: boolean;
}

export function useMic({ onFinal, onInterim, continuous = false }: UseMicOpts) {
  const recogRef = useRef<SpeechRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = continuous;
    r.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (interim && onInterim) onInterim(interim);
      if (final) onFinal(final.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    return () => { try { r.stop(); } catch { /* noop */ } };
  }, [continuous, onFinal, onInterim]);

  const start = useCallback(() => {
    if (!recogRef.current) return;
    try { recogRef.current.start(); setListening(true); } catch { /* already running */ }
  }, []);
  const stop = useCallback(() => {
    try { recogRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);
  const toggle = useCallback(() => { listening ? stop() : start(); }, [listening, start, stop]);

  return { listening, supported, start, stop, toggle };
}
