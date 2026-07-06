// Color ramps for condition scores. Each scheme is four anchor colors,
// one per category (excellent, acceptable, marginal, notForMe), sitting
// at scores 0, 1/3, 2/3, and 1. An hour's color is its score's position
// on the ramp, blending linearly between adjacent anchors; a metric's
// color is its category's anchor exactly.
//
// The shipped anchors can be retuned without code changes through the
// "colors" key in config.json, keyed by scheme id.

import { CATEGORY_ORDER } from "./evaluate.js";
import { getConfigColors } from "../config.js";

export const SCHEMES = {
  "green-red": {
    label: "Green to red (default)",
    anchors: ["#15803D", "#8AC926", "#FFCA3A", "#C0392B"],
  },
  "blue-red": {
    label: "Blue to red (colorblind friendly)",
    anchors: ["#1982C4", "#74B9E0", "#FFCA3A", "#C0392B"],
  },
};

export function schemeAnchors(schemeId) {
  const id = SCHEMES[schemeId] ? schemeId : "green-red";
  const override = getConfigColors()[id];
  return Array.isArray(override) && override.length === 4
    ? override
    : SCHEMES[id].anchors;
}

// The anchor color of a category, used for per-metric chips.
export function categoryColor(category, schemeId) {
  const anchors = schemeAnchors(schemeId);
  return anchors[CATEGORY_ORDER[category] ?? 2];
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// Continuous ramp position, GIS style: score 0 is the excellent anchor,
// 1/3 acceptable, 2/3 marginal, 1 the notForMe anchor, with scores in
// between landing on intermediate shades.
export function rampColor(score, schemeId) {
  const anchors = schemeAnchors(schemeId);
  const t = Math.min(Math.max(score, 0), 1) * (anchors.length - 1);
  const i = Math.min(Math.floor(t), anchors.length - 2);
  return mix(anchors[i], anchors[i + 1], t - i);
}

// Chip color for the sunrise/sunset glow prediction: slate gray for a
// sky that stays gray or plain, warming through gold to vivid coral as
// the score rises. Deliberately outside the condition schemes because
// it depicts the literal color of the sky, not a paddling category.
const GLOW_ANCHORS = ["#8D979E", "#FFC46B", "#FF7043"];

export function glowColor(score) {
  const t = Math.min(Math.max(score, 0), 1) * (GLOW_ANCHORS.length - 1);
  const i = Math.min(Math.floor(t), GLOW_ANCHORS.length - 2);
  return mix(GLOW_ANCHORS[i], GLOW_ANCHORS[i + 1], t - i);
}

// Foreground color that stays readable on the given background, which
// may be a #hex or an rgb() string. Dark ink on the light gold anchors,
// white on deep green and red.
export function textColorOn(background) {
  let rgb;
  if (background.startsWith("#")) rgb = hexToRgb(background);
  else rgb = (background.match(/\d+/g) ?? ["128", "128", "128"]).map(Number);
  const [r, g, b] = rgb;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? "#1e2a30" : "#ffffff";
}
