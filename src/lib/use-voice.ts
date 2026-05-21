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
   Persisted voice prefs
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
    .replace(/```chart[\s\S]*?```/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[#*_>~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

/* ============================================================
   Sakura speech — ElevenLabs (Rachel) via server route, with
   SpeechSynthesis fallback if the network fails.
   ============================================================ */

export function useSakuraSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef(0);
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    tokenRef.current++;
    try {
      const a = audioRef.current;
      if (a) { a.pause(); a.src = ""; }
    } catch { /* noop */ }
    audioRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    setSpeaking(false);
  }, []);

  const speak = useCallback(async (rawText: string, opts?: { speed?: VoiceSpeed; onEnd?: () => void; onStart?: () => void }) => {
    const text = cleanForSpeech(rawText);
    if (!text) { opts?.onEnd?.(); return; }
    stop();
    const myToken = ++tokenRef.current;
    setSpeaking(true);

    const finish = () => {
      if (tokenRef.current !== myToken) return;
      setSpeaking(false);
      opts?.onEnd?.();
    };

    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (tokenRef.current !== myToken) return;
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const blob = await res.blob();
      if (tokenRef.current !== myToken) return;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = speedToRate(opts?.speed ?? "normal");
      audioRef.current = audio;
      audio.onplay = () => opts?.onStart?.();
      audio.onended = () => { URL.revokeObjectURL(url); finish(); };
      audio.onerror = () => { URL.revokeObjectURL(url); finish(); };
      await audio.play();
      return;
    } catch (e) {
      console.warn("ElevenLabs TTS failed, falling back", e);
    }

    // Fallback: browser SpeechSynthesis
    try {
      if (!window.speechSynthesis) { finish(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = speedToRate(opts?.speed ?? "normal");
      u.pitch = 1.05;
      u.onstart = () => opts?.onStart?.();
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
    } catch {
      finish();
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);
  return { speak, stop, speaking };
}

/* ============================================================
   Simple push-to-talk mic (browser SpeechRecognition) — used by
   the regular chat input. Voice Mode uses MediaRecorder+Whisper.
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
    r.onresult = (e: any) => {
      let interim = "", final = "";
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
    try { recogRef.current.start(); setListening(true); } catch { /* noop */ }
  }, []);
  const stop = useCallback(() => {
    try { recogRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);
  const toggle = useCallback(() => { listening ? stop() : start(); }, [listening, start, stop]);

  return { listening, supported, start, stop, toggle };
}

/* ============================================================
   Voice Activity Detection + MediaRecorder + Groq Whisper.
   - opens mic once for the lifetime of the hook
   - emits `level` (0..1) for waveform visualization
   - calls `onSpeechStart` when sustained speech begins
     (used to interrupt Sakura mid-sentence)
   - records the utterance and stops after `silenceMs` of silence
   - posts the blob to /api/voice/transcribe and resolves with text
   ============================================================ */

export interface UseVoiceCaptureOpts {
  active: boolean;
  onSpeechStart?: () => void;
  onTranscript: (text: string) => void;
  onError?: (err: Error) => void;
  silenceMs?: number;          // default 2500
  speechThreshold?: number;    // RMS 0..1, default 0.04
  minSpeechMs?: number;        // default 300, ignore micro-sounds
}

type CapState = "idle" | "listening" | "recording" | "transcribing";

export function useVoiceCapture(opts: UseVoiceCaptureOpts) {
  const {
    active, onSpeechStart, onTranscript, onError,
    silenceMs = 2500, speechThreshold = 0.04, minSpeechMs = 300,
  } = opts;

  const [state, setState] = useState<CapState>("idle");
  const [level, setLevel] = useState(0);
  const [silenceRemainingMs, setSilenceRemainingMs] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechStartAtRef = useRef<number>(0);
  const lastVoiceAtRef = useRef<number>(0);
  const recordingRef = useRef(false);
  const pausedRef = useRef(false); // paused while Sakura speaks / transcribing

  const cbsRef = useRef({ onSpeechStart, onTranscript, onError });
  useEffect(() => { cbsRef.current = { onSpeechStart, onTranscript, onError }; }, [onSpeechStart, onTranscript, onError]);

  const pickMime = () => {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const m of candidates) if ((MediaRecorder as any).isTypeSupported?.(m)) return m;
    return "";
  };

  const stopRecorderAndSend = useCallback(() => {
    const rec = recRef.current;
    if (!rec || !recordingRef.current) return;
    recordingRef.current = false;
    setSilenceRemainingMs(0);
    try { rec.stop(); } catch { /* noop */ }
  }, []);

  const startRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recordingRef.current) return;
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      cbsRef.current.onError?.(e as Error);
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (blob.size < 1500) { // too short, skip transcription
        setState("listening");
        return;
      }
      setState("transcribing");
      pausedRef.current = true; // do not start a new recording until consumer resumes
      try {
        const fd = new FormData();
        const ext = (rec.mimeType || "audio/webm").includes("mp4") ? "mp4"
          : (rec.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
        fd.append("file", blob, `speech.${ext}`);
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (text) cbsRef.current.onTranscript(text);
        else setState("listening");
      } catch (err) {
        cbsRef.current.onError?.(err as Error);
        setState("listening");
        pausedRef.current = false;
      }
    };
    recRef.current = rec;
    recordingRef.current = true;
    speechStartAtRef.current = performance.now();
    lastVoiceAtRef.current = performance.now();
    setState("recording");
    try { rec.start(100); } catch (e) { cbsRef.current.onError?.(e as Error); }
  }, []);

  // Control loop driven by RAF — measures level + manages VAD
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.fftSize);

        setState("listening");
        pausedRef.current = false;

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const norm = Math.min(1, rms * 3);
          setLevel(norm);

          const now = performance.now();
          const isSpeech = rms > speechThreshold;

          if (!pausedRef.current) {
            if (isSpeech) {
              lastVoiceAtRef.current = now;
              if (!recordingRef.current) {
                // start recording when speech first detected
                startRecorder();
                cbsRef.current.onSpeechStart?.();
              }
              setSilenceRemainingMs(silenceMs);
            } else if (recordingRef.current) {
              const silentFor = now - lastVoiceAtRef.current;
              const remaining = Math.max(0, silenceMs - silentFor);
              setSilenceRemainingMs(remaining);
              const spokenFor = lastVoiceAtRef.current - speechStartAtRef.current;
              if (silentFor >= silenceMs && spokenFor >= minSpeechMs) {
                stopRecorderAndSend();
              } else if (silentFor >= silenceMs && spokenFor < minSpeechMs) {
                // too short — abandon and keep listening
                recordingRef.current = false;
                try { recRef.current?.stop(); } catch { /* noop */ }
                chunksRef.current = [];
                setState("listening");
                setSilenceRemainingMs(0);
              }
            }
          }

          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        cbsRef.current.onError?.(err as Error);
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { recRef.current?.stop(); } catch { /* noop */ }
      try { ctxRef.current?.close(); } catch { /* noop */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      analyserRef.current = null;
      ctxRef.current = null;
      streamRef.current = null;
      recordingRef.current = false;
      setLevel(0);
      setSilenceRemainingMs(0);
      setState("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, silenceMs, speechThreshold, minSpeechMs]);

  /** Consumer calls this after Sakura finishes speaking to resume listening. */
  const resume = useCallback(() => {
    pausedRef.current = false;
    speechStartAtRef.current = performance.now();
    lastVoiceAtRef.current = performance.now();
    setState("listening");
  }, []);

  /** Pause mic capture (e.g., while Sakura is speaking, or for a mute toggle). */
  const pause = useCallback(() => {
    pausedRef.current = true;
    if (recordingRef.current) {
      recordingRef.current = false;
      try { recRef.current?.stop(); } catch { /* noop */ }
      chunksRef.current = [];
    }
    setSilenceRemainingMs(0);
  }, []);

  return { state, level, silenceRemainingMs, resume, pause };
}
