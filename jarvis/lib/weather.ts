interface WeatherResult {
  tempCelsius: number;
  feelsLikeCelsius: number;
  uvIndex: number;
  condition: string;
}

interface DailyData {
  weather: WeatherResult | null;
  fact: string | null;
}

let cache: { data: DailyData; expiresAt: number } | null = null;

const WMO_CODES: Record<string, string> = {
  "0": "clear",
  "1": "mostly clear", "2": "partly cloudy", "3": "overcast",
  "45": "foggy", "48": "foggy",
  "51": "drizzling", "53": "drizzling", "55": "drizzling",
  "61": "rainy", "63": "rainy", "65": "heavily rainy",
  "71": "snowy", "73": "snowy", "75": "heavily snowy",
  "77": "snowy",
  "80": "showering", "81": "showering", "82": "showering",
  "85": "snowy", "86": "snowy",
  "95": "stormy", "96": "stormy", "99": "stormy",
};

function codeToCondition(code: number): string {
  return WMO_CODES[String(code)] ?? "cloudy";
}

function uvLabel(uv: number): string {
  if (uv <= 2) return "low";
  if (uv <= 5) return "moderate";
  if (uv <= 7) return "high";
  if (uv <= 10) return "very high";
  return "extreme";
}

async function fetchWeather(): Promise<WeatherResult | null> {
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=temperature_2m,apparent_temperature,weather_code,uv_index&temperature_unit=celsius",
      { next: { revalidate: 900 } }
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        weather_code: number;
        uv_index: number;
      };
    };
    return {
      tempCelsius: Math.round(data.current.temperature_2m),
      feelsLikeCelsius: Math.round(data.current.apparent_temperature),
      uvIndex: Math.round(data.current.uv_index),
      condition: codeToCondition(data.current.weather_code),
    };
  } catch {
    return null;
  }
}

async function fetchDailyFact(): Promise<string | null> {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const res = await fetch(`https://numbersapi.com/${month}/${day}/date?json`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json() as { text: string; found: boolean };
    return data.found ? data.text : null;
  } catch {
    return null;
  }
}

export async function getLondonWeatherAndFact(): Promise<DailyData> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;

  const [weather, fact] = await Promise.all([fetchWeather(), fetchDailyFact()]);
  const data: DailyData = { weather, fact };
  cache = { data, expiresAt: Date.now() + 15 * 60 * 1000 };
  return data;
}

export { uvLabel };
