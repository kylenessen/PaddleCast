// Map WMO weather codes (used by Open-Meteo) to PaddleCast condition
// categories. Categories are the units users toggle in their preferences.

export const CONDITION_CATEGORIES = [
  { id: "sunny", label: "Sunny / Clear" },
  { id: "partly", label: "Partly cloudy" },
  { id: "overcast", label: "Overcast" },
  { id: "fog", label: "Fog" },
  { id: "drizzle", label: "Drizzle / Light rain" },
  { id: "rain", label: "Rain" },
  { id: "storm", label: "Thunderstorm / Severe" },
];

export function categoryFromWmoCode(code) {
  if (code === 0) return "sunny";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 57) || code === 61 || code === 80) return "drizzle";
  if ((code >= 62 && code <= 67) || (code >= 71 && code <= 77) ||
      code === 81 || code === 82 || (code >= 85 && code <= 86)) return "rain";
  if (code >= 95) return "storm";
  return "overcast";
}

export function describeWmoCode(code) {
  const names = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
    56: "Freezing drizzle", 57: "Dense freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Light showers", 81: "Showers", 82: "Violent showers",
    85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail",
    99: "Thunderstorm with heavy hail",
  };
  return names[code] ?? `Weather code ${code}`;
}
