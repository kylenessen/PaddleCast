// NOAA solar position calculations. Returns sunrise/sunset and civil
// twilight (first light / last light) as UTC epoch milliseconds for a
// given calendar date at a latitude/longitude.

const DEG = Math.PI / 180;

function julianDay(y, m, d) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    d + b - 1524.5
  );
}

function solarEvent(jd, lat, lon, zenithDeg, rising) {
  const t = (jd - 2451545.0) / 36525.0;
  const geomMeanLongSun =
    (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const geomMeanAnomSun = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const sunEqCtr =
    Math.sin(geomMeanAnomSun * DEG) *
      (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * geomMeanAnomSun * DEG) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * geomMeanAnomSun * DEG) * 0.000289;
  const sunTrueLong = geomMeanLongSun + sunEqCtr;
  const sunAppLong =
    sunTrueLong - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * DEG);
  const meanObliq =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliqCorr = meanObliq + 0.00256 * Math.cos((125.04 - 1934.136 * t) * DEG);
  const declination =
    Math.asin(Math.sin(obliqCorr * DEG) * Math.sin(sunAppLong * DEG)) / DEG;

  const varY = Math.tan((obliqCorr / 2) * DEG) ** 2;
  const eqOfTime =
    4 *
    ((varY * Math.sin(2 * geomMeanLongSun * DEG) -
      2 * eccent * Math.sin(geomMeanAnomSun * DEG) +
      4 * eccent * varY * Math.sin(geomMeanAnomSun * DEG) *
        Math.cos(2 * geomMeanLongSun * DEG) -
      0.5 * varY * varY * Math.sin(4 * geomMeanLongSun * DEG) -
      1.25 * eccent * eccent * Math.sin(2 * geomMeanAnomSun * DEG)) /
      DEG);

  const cosHA =
    (Math.cos(zenithDeg * DEG) -
      Math.sin(lat * DEG) * Math.sin(declination * DEG)) /
    (Math.cos(lat * DEG) * Math.cos(declination * DEG));
  if (cosHA > 1 || cosHA < -1) return null; // sun never reaches this zenith
  const haDeg = Math.acos(cosHA) / DEG;

  const solarNoonMin = 720 - 4 * lon - eqOfTime; // minutes UTC
  const eventMin = rising ? solarNoonMin - haDeg * 4 : solarNoonMin + haDeg * 4;
  return (jd - 2440587.5) * 86400000 + eventMin * 60000;
}

// date: { y, m, d } for the location's local calendar date.
// Returns { firstLight, sunrise, sunset, lastLight } in UTC epoch ms,
// or null values at extreme latitudes.
export function sunTimes(date, lat, lon) {
  const jd = julianDay(date.y, date.m, date.d);
  return {
    firstLight: solarEvent(jd, lat, lon, 96, true), // civil dawn
    sunrise: solarEvent(jd, lat, lon, 90.833, true),
    sunset: solarEvent(jd, lat, lon, 90.833, false),
    lastLight: solarEvent(jd, lat, lon, 96, false), // civil dusk
  };
}
