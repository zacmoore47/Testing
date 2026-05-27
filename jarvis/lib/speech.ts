export interface VoiceSettings {
  rate: number;
  pitch: number;
  volume: number;
  voiceName: string | null;
}

const VOICE_PRIORITY = [
  "Google UK English Male",
  "Daniel",
  "Microsoft Ryan Online (Natural) - English (United Kingdom)",
  "Microsoft Ryan",
];

export function getPreferredVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  for (const name of VOICE_PRIORITY) {
    const match = voices.find((v) => v.name === name);
    if (match) return match;
  }

  const gbMale = voices.find(
    (v) => v.lang === "en-GB" && v.name.toLowerCase().includes("male")
  );
  if (gbMale) return gbMale;

  const anyGB = voices.find((v) => v.lang === "en-GB");
  if (anyGB) return anyGB;

  return voices.find((v) => v.lang.startsWith("en")) ?? null;
}

export function getAvailableEnglishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
}

export function speak(
  text: string,
  settings?: Partial<VoiceSettings>
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      reject(new Error("Speech synthesis not supported"));
      return;
    }

    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = settings?.rate ?? 1.1;
    utter.pitch = settings?.pitch ?? 0.85;
    utter.volume = settings?.volume ?? 1.0;

    const applyVoice = () => {
      if (settings?.voiceName) {
        const named = window.speechSynthesis.getVoices().find((v) => v.name === settings.voiceName);
        if (named) utter.voice = named;
      } else {
        const preferred = getPreferredVoice();
        if (preferred) utter.voice = preferred;
      }
      utter.onend = () => resolve();
      utter.onerror = (e) => reject(new Error(e.error));
      window.speechSynthesis.speak(utter);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      applyVoice();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        applyVoice();
      };
    }
  });
}
