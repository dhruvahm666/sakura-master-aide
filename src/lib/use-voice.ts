import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

/* ============================================================
   Settings (persisted in localStorage)
   ============================================================ */

const TTS_KEY = "sakura.ttsEnabled";
const SPEED_KEY = "sakura.voiceSpeed";

export type VoiceSpeed = "slow" | "normal" | "fast";

export function useTtsEnabled() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem(TTS_KEY);
    return v === null ? true : v === "1";
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

export function useVoiceSpeed() {
  const [speed, setSpeedState] = useState<VoiceSpeed>(() => {
    if (typeof window === "undefined") return "normal";
    return ((localStorage.getItem(SPEED_KEY) as VoiceSpeed) || "normal");
  });
  const setSpeed = useCallback((s: VoiceSpeed) => {
    localStorage.setItem(SPEED_KEY, s);
    setSpeedState(s);
  }, []);
  return { speed, setSpeed };
}

export function speedToRate(s: VoiceSpeed): number {
  return s === "slow" ? 0.85 : s === "fast" ? 1.2 : 1.0;
}

/* ============================================================
   Text cleaning for natural speech
   ============================================================ */

export function cleanForSpeech(text: string): string {
  return text
    .replace(/```chart[\s\S]*?```/g, " (chart shown) ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
}

/* ============================================================
   Sakura speech — Kokoro TTS with graceful fallbacks
   ============================================================ */

const KOKORO_PRIMARY = "https://api.kokorotts.com/v1/audio/speech";
const KOKORO_FALLBACK = "https://voice-generator.pages.dev/api/generate";

async function fetchKokoroAudio(text: string, speed: number): Promise<Blob | null> {
  // Primary endpoint
  try {
    const res = await fetch(KOKORO_PRIMARY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kokoro", input: text, voice: "af_sarah", speed }),
    });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0 && blob.type.startsWith("audio")) return blob;
    }
  } catch { /* fall through */ }

  // Fallback endpoint
  try {
    const res = await fetch(KOKORO_FALLBACK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "af_sarah", speed }),
    });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0 && blob.type.startsWith("audio")) return blob;
    }
  } catch { /* fall through */ }

  return null;
}

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const prefer = [
    "Google UK English Female",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Samantha",
    "Karen",
    "Victoria",
  ];
  for (const name of prefer) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  return voices.find((v) => /female|samantha|aria|jenny|sara|zira/i.test(v.name)) ?? voices[0];
}

export function useSakuraSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const tokenRef = useRef(0);

  const stop = useCallback(() => {
    tokenRef.current++;
    try {
      audioRef.current?.pause();
      if (audioRef.current) {
        audioRef.current.src = "";
        audioRef.current = null;
      }
    } catch { /* noop */ }
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch { /* noop */ }
    synthRef.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback(async (rawText: string, opts?: { speed?: VoiceSpeed; onEnd?: () => void }) => {
    const text = cleanForSpeech(rawText);
    if (!text || typeof window === "undefined") return;
    stop();
    const myToken = ++tokenRef.current;
    setSpeaking(true);
    const rate = speedToRate(opts?.speed ?? "normal");

    const finish = () => {
      if (tokenRef.current !== myToken) return;
      setSpeaking(false);
      opts?.onEnd?.();
    };

    // Try Kokoro
    const blob = await fetchKokoroAudio(text, rate);
    if (tokenRef.current !== myToken) return;

    if (blob) {
      try {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); finish(); };
        audio.onerror = () => { URL.revokeObjectURL(url); finish(); };
        await audio.play();
        return;
      } catch (e) {
        console.warn("Kokoro audio play failed, falling back to SpeechSynthesis", e);
      }
    }

    // Browser SpeechSynthesis fallback
    if (window.speechSynthesis) {
      try {
        // Voices may load async on first use
        if (!window.speechSynthesis.getVoices().length) {
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, 600);
            window.speechSynthesis.onvoiceschanged = () => { clearTimeout(t); resolve(); };
          });
        }
        if (tokenRef.current !== myToken) return;
        const u = new SpeechSynthesisUtterance(text);
        const v = pickBrowserVoice();
        if (v) u.voice = v;
        u.rate = rate;
        u.pitch = 1.05;
        u.onend = finish;
        u.onerror = finish;
        synthRef.current = u;
        window.speechSynthesis.speak(u);
        return;
      } catch (e) {
        console.error("SpeechSynthesis failed", e);
      }
    }

    finish();
  }, [stop]);

  useEffect(() => () => stop(), [stop]);
  return { speak, stop, speaking };
}

/* ============================================================
   Simple mic (push-to-talk) used by the regular chat input.
   ============================================================ */

export interface UseMicOpts {
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
}

export function useMic({ onFinal, onInterim }: UseMicOpts) {
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
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
  }, [onFinal, onInterim]);

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

/* ============================================================
   Continuous conversation mic — for Voice Mode.
   - continuous=true, interimResults=true
   - silence detection (1.5s after last speech) → commits transcript
   - auto-restarts on onend until externally stopped
   - emits onSpeechStart whenever the user begins talking (for interrupts)
   ============================================================ */

export interface ContinuousMicOpts {
  onCommit: (text: string) => void;
  onInterim?: (text: string) => void;
  onSpeechStart?: () => void;
  silenceMs?: number;
}

export function useContinuousMic(opts: ContinuousMicOpts) {
  const { onCommit, onInterim, onSpeechStart, silenceMs = 1500 } = opts;
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const bufferRef = useRef("");
  const interimRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeechFiredRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  // Keep callbacks fresh without re-creating recognizer
  const cbs = useRef({ onCommit, onInterim, onSpeechStart });
  useEffect(() => { cbs.current = { onCommit, onInterim, onSpeechStart }; }, [onCommit, onInterim, onSpeechStart]);

  const clearSilence = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  };

  const commit = useCallback(() => {
    clearSilence();
    const text = (bufferRef.current + " " + interimRef.current).trim();
    bufferRef.current = "";
    interimRef.current = "";
    lastSpeechFiredRef.current = false;
    if (text) cbs.current.onCommit(text);
  }, []);

  const scheduleSilence = useCallback(() => {
    clearSilence();
    silenceTimerRef.current = setTimeout(() => {
      commit();
    }, silenceMs);
  }, [commit, silenceMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.onstart = () => setListening(true);
    r.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript + " ";
        else interim += res[0].transcript + " ";
      }
      if ((interim || final) && !lastSpeechFiredRef.current) {
        lastSpeechFiredRef.current = true;
        cbs.current.onSpeechStart?.();
      }
      if (final) bufferRef.current += final;
      interimRef.current = interim;
      cbs.current.onInterim?.((bufferRef.current + " " + interim).trim());
      scheduleSilence();
    };
    r.onerror = (ev: any) => {
      // 'no-speech' is benign — recognizer will end and we restart below
      if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
        activeRef.current = false;
        setListening(false);
      }
    };
    r.onend = () => {
      setListening(false);
      if (activeRef.current) {
        // Restart shortly to keep continuous listening
        setTimeout(() => {
          if (activeRef.current) {
            try { r.start(); } catch { /* may already be starting */ }
          }
        }, 150);
      }
    };
    recogRef.current = r;
    return () => {
      activeRef.current = false;
      clearSilence();
      try { r.abort(); } catch { /* noop */ }
    };
  }, [scheduleSilence]);

  const start = useCallback(() => {
    if (!recogRef.current) return;
    activeRef.current = true;
    bufferRef.current = "";
    interimRef.current = "";
    lastSpeechFiredRef.current = false;
    try { recogRef.current.start(); } catch { /* already running */ }
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    clearSilence();
    bufferRef.current = "";
    interimRef.current = "";
    try { recogRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
}

/* ============================================================
   Mic level meter (waveform) — uses getUserMedia + AnalyserNode.
   Returns a value 0..1 representing current RMS volume.
   ============================================================ */

export function useMicLevel(active: boolean) {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setLevel(Math.min(1, rms * 2.5));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        console.warn("Mic level meter unavailable", e);
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { ctxRef.current?.close(); } catch { /* noop */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current = null;
      streamRef.current = null;
      setLevel(0);
    };
  }, [active]);

  return level;
}
