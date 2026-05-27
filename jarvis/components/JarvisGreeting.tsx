"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { Volume2, VolumeX, RotateCcw } from "lucide-react";
import { useJarvisVoice } from "@/hooks/useJarvisVoice";

const GREETED_KEY = "jarvis_greeted";

interface Props {
  topTaskTitle: string | null;
}

function getTimeOfDayWord(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

async function fetchWeatherLine(): Promise<string> {
  try {
    const res = await fetch("/api/weather", { cache: "no-store" });
    if (!res.ok) return "";
    const data = await res.json() as { tempCelsius: number; condition: string } | null;
    if (!data) return "";
    return `The weather in London is currently ${data.tempCelsius} degrees and ${data.condition}.`;
  } catch {
    return "";
  }
}

function buildGreeting(tod: string, weatherLine: string, taskTitle: string | null): string {
  const task =
    taskTitle
      ? `Your highest priority task today is: ${taskTitle}.`
      : "You have no pending tasks. A rare and beautiful sight, Sir.";
  const parts = [`Good ${tod}, Sir.`, weatherLine, task].filter(Boolean);
  return parts.join(" ");
}

export function JarvisGreeting({ topTaskTitle }: Props) {
  const { isMuted, isSpeaking, toggleMute, speak, replay } = useJarvisVoice();
  const [showBanner, setShowBanner] = useState(false);
  const greetingRef = useRef<string>("");
  const hasAttempted = useRef(false);

  const attemptGreeting = useCallback(
    async (text: string) => {
      try {
        await speak(text);
        setShowBanner(false);
      } catch {
        setShowBanner(true);
      }
    },
    [speak]
  );

  useEffect(() => {
    if (isMuted) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(GREETED_KEY)) return;
    if (hasAttempted.current) return;
    hasAttempted.current = true;

    const tod = getTimeOfDayWord();

    fetchWeatherLine().then((weatherLine) => {
      const text = buildGreeting(tod, weatherLine, topTaskTitle);
      greetingRef.current = text;

      sessionStorage.setItem(GREETED_KEY, "1");

      // Short delay to let browser unlock audio context after user navigation
      setTimeout(() => {
        attemptGreeting(text);
      }, 600);
    });
  }, [isMuted, topTaskTitle, attemptGreeting]);

  const handleBannerClick = useCallback(() => {
    setShowBanner(false);
    void speak(greetingRef.current);
  }, [speak]);

  const handleReplay = useCallback(() => {
    if (!greetingRef.current) {
      const tod = getTimeOfDayWord();
      fetchWeatherLine().then((weatherLine) => {
        const text = buildGreeting(tod, weatherLine, topTaskTitle);
        greetingRef.current = text;
        replay(text);
      });
    } else {
      replay(greetingRef.current);
    }
  }, [topTaskTitle, replay]);

  return (
    <>
      {/* Controls row */}
      <div className="flex items-center gap-2">
        {isSpeaking && (
          <div className="flex items-center gap-1 mr-1" aria-label="Speaking">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="inline-block w-1 rounded-full bg-blue-400"
                style={{
                  height: "14px",
                  animation: `pulse-bar 0.8s ease-in-out ${delay}ms infinite alternate`,
                }}
              />
            ))}
          </div>
        )}
        <button
          onClick={handleReplay}
          title="Replay greeting"
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={toggleMute}
          title={isMuted ? "Unmute Jarvis" : "Mute Jarvis"}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Autoplay banner */}
      {showBanner && (
        <div
          onClick={handleBannerClick}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 cursor-pointer rounded-xl border border-blue-500/30 bg-zinc-900/95 backdrop-blur px-5 py-3 text-sm text-zinc-300 shadow-2xl flex items-center gap-3"
        >
          <Volume2 className="h-4 w-4 text-blue-400 shrink-0" />
          <span>Tap anywhere to activate Jarvis voice greeting</span>
          <button
            onClick={(e) => { e.stopPropagation(); setShowBanner(false); }}
            className="ml-2 text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse-bar {
          from { transform: scaleY(0.4); opacity: 0.6; }
          to   { transform: scaleY(1);   opacity: 1; }
        }
      `}</style>
    </>
  );
}
