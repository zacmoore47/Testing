interface WeatherResult {
  tempCelsius: number;
  condition: string;
}

let cache: { result: WeatherResult; expiresAt: number } | null = null;

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

export async function getLondonWeather(): Promise<WeatherResult | null> {
  if (cache && Date.now() < cache.expiresAt) return cache.result;

  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=temperature_2m,weather_code&temperature_unit=celsius",
      { next: { revalidate: 900 } }
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      current: { temperature_2m: number; weather_code: number };
    };
    const result: WeatherResult = {
      tempCelsius: Math.round(data.current.temperature_2m),
      condition: codeToCondition(data.current.weather_code),
    };
    cache = { result, expiresAt: Date.now() + 15 * 60 * 1000 };
    return result;
  } catch {
    return null;
  }
}
