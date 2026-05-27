"use client";
import { useEffect, useRef, useCallback } from "react";
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

interface WeatherData {
  weather: { tempCelsius: number; feelsLikeCelsius: number; uvIndex: number; condition: string } | null;
  fact: string | null;
}

function uvLabel(uv: number): string {
  if (uv <= 2) return "low";
  if (uv <= 5) return "moderate";
  if (uv <= 7) return "high";
  if (uv <= 10) return "very high";
  return "extreme";
}

async function fetchWeatherAndFact(): Promise<WeatherData> {
  try {
    const res = await fetch("/api/weather", { cache: "no-store" });
    if (!res.ok) return { weather: null, fact: null };
    return await res.json() as WeatherData;
  } catch {
    return { weather: null, fact: null };
  }
}

function buildGreeting(tod: string, weatherData: WeatherData, taskTitle: string | null): string {
  const parts: string[] = [`Good ${tod}, Sir.`];

  if (weatherData.weather) {
    const { tempCelsius, feelsLikeCelsius, uvIndex, condition } = weatherData.weather;
    parts.push(
      `The weather in London is currently ${tempCelsius} degrees and ${condition}, feeling like ${feelsLikeCelsius} degrees, with a ${uvLabel(uvIndex)} UV index.`
    );
  }

  const task = taskTitle
    ? `Your highest priority task today is: ${taskTitle}.`
    : "You have no pending tasks. A rare and beautiful sight, Sir.";
  parts.push(task);

  if (weatherData.fact) {
    parts.push(`And on this day — ${weatherData.fact}`);
  }

  return parts.join(" ");
}

export function JarvisGreeting({ topTaskTitle }: Props) {
  const { isMuted, isSpeaking, toggleMute, speak, replay } = useJarvisVoice();
  const greetingRef = useRef<string>("");
  const hasAttempted = useRef(false);
  const pendingRef = useRef<string>("");

  const doSpeak = useCallback(
    (text: string) => { void speak(text); },
    [speak]
  );

  useEffect(() => {
    if (isMuted) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(GREETED_KEY)) return;
    if (hasAttempted.current) return;
    hasAttempted.current = true;

    fetchWeatherAndFact().then((weatherData) => {
      const text = buildGreeting(getTimeOfDayWord(), weatherData, topTaskTitle);
      greetingRef.current = text;
      sessionStorage.setItem(GREETED_KEY, "1");

      // Try immediately — works when the user navigated here via a link (user gesture)
      const tryNow = () => {
        window.speechSynthesis.cancel();
        const test = new SpeechSynthesisUtterance("");
        window.speechSynthesis.speak(test);
        // Give the browser one tick to accept the request
        setTimeout(() => {
          if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel();
            doSpeak(text);
          } else {
            // Browser blocked it — wait for first natural interaction
            pendingRef.current = text;
          }
        }, 100);
      };

      setTimeout(tryNow, 400);
    });
  }, [isMuted, topTaskTitle, doSpeak]);

  // Attach one-time interaction listeners to fire the deferred greeting
  useEffect(() => {
    const EVENTS = ["mousemove", "pointerdown", "keydown", "touchstart"] as const;

    function onInteraction() {
      if (!pendingRef.current) return;
      const text = pendingRef.current;
      pendingRef.current = "";
      EVENTS.forEach((e) => window.removeEventListener(e, onInteraction));
      doSpeak(text);
    }

    EVENTS.forEach((e) => window.addEventListener(e, onInteraction, { once: true, passive: true }));
    return () => EVENTS.forEach((e) => window.removeEventListener(e, onInteraction));
  }, [doSpeak]);

  const handleReplay = useCallback(() => {
    const text = greetingRef.current;
    if (text) {
      replay(text);
    } else {
      fetchWeatherAndFact().then((weatherData) => {
        const t = buildGreeting(getTimeOfDayWord(), weatherData, topTaskTitle);
        greetingRef.current = t;
        replay(t);
      });
    }
  }, [topTaskTitle, replay]);

  return (
    <>
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

      <style>{`
        @keyframes pulse-bar {
          from { transform: scaleY(0.4); opacity: 0.6; }
          to   { transform: scaleY(1);   opacity: 1; }
        }
      `}</style>
    </>
  );
}
