"use client";
import { useState, useCallback, useEffect } from "react";
import { speak, VoiceSettings } from "@/lib/speech";

const MUTE_KEY = "jarvis_voice_muted";
const RATE_KEY = "jarvis_voice_rate";
const PITCH_KEY = "jarvis_voice_pitch";
const VOICE_KEY = "jarvis_voice_name";

function loadBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "true";
}

function loadNum(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = parseFloat(localStorage.getItem(key) ?? "");
  return isNaN(v) ? fallback : v;
}

export interface JarvisVoiceHook {
  isMuted: boolean;
  isSpeaking: boolean;
  toggleMute: () => void;
  speak: (text: string) => Promise<void>;
  replay: (text: string) => void;
  settings: VoiceSettings;
  updateSettings: (patch: Partial<VoiceSettings>) => void;
}

export function useJarvisVoice(): JarvisVoiceHook {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>({
    rate: 0.95,
    pitch: 0.85,
    volume: 1.0,
    voiceName: null,
  });

  useEffect(() => {
    setIsMuted(loadBool(MUTE_KEY, false));
    setSettings({
      rate: loadNum(RATE_KEY, 0.95),
      pitch: loadNum(PITCH_KEY, 0.85),
      volume: 1.0,
      voiceName: localStorage.getItem(VOICE_KEY),
    });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem(MUTE_KEY, String(next));
      if (next && typeof window !== "undefined") window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  const doSpeak = useCallback(
    async (text: string) => {
      if (isMuted) return;
      setIsSpeaking(true);
      try {
        await speak(text, settings);
      } finally {
        setIsSpeaking(false);
      }
    },
    [isMuted, settings]
  );

  const replay = useCallback(
    (text: string) => {
      void doSpeak(text);
    },
    [doSpeak]
  );

  const updateSettings = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (patch.rate !== undefined) localStorage.setItem(RATE_KEY, String(patch.rate));
      if (patch.pitch !== undefined) localStorage.setItem(PITCH_KEY, String(patch.pitch));
      if (patch.voiceName !== undefined) {
        if (patch.voiceName) localStorage.setItem(VOICE_KEY, patch.voiceName);
        else localStorage.removeItem(VOICE_KEY);
      }
      return next;
    });
  }, []);

  return { isMuted, isSpeaking, toggleMute, speak: doSpeak, replay, settings, updateSettings };
}
