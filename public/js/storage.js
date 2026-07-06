// All persistence lives in localStorage on the user's device. No
// accounts, no server-side state.
//
// The repo ships default locations (see locations.js). A saved location
// with the same id shadows its default, so edits to a default stick
// without touching the shipped list, and deleting one leaves a
// tombstone in removedDefaults so it stays gone across sessions.

import { DEFAULT_LOCATIONS } from "./locations.js";

const KEY = "paddlecast.v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getSettings() {
  return { scheme: "green-red", ...load().settings };
}

export function setSettings(settings) {
  const state = load();
  state.settings = { ...state.settings, ...settings };
  save(state);
}

export function getLocations() {
  const state = load();
  const removed = new Set(state.removedDefaults ?? []);
  const saved = state.locations ?? [];
  const savedById = new Map(saved.map((l) => [l.id, l]));
  const out = [];
  for (const def of DEFAULT_LOCATIONS) {
    if (removed.has(def.id)) continue;
    out.push(savedById.get(def.id) ?? def);
    savedById.delete(def.id);
  }
  for (const l of saved) {
    if (savedById.has(l.id)) out.push(l);
  }
  return out;
}

export function getLocation(id) {
  return getLocations().find((l) => l.id === id) ?? null;
}

export function saveLocation(location) {
  const state = load();
  state.locations = state.locations ?? [];
  const i = state.locations.findIndex((l) => l.id === location.id);
  if (i >= 0) state.locations[i] = location;
  else state.locations.push(location);
  save(state);
}

export function deleteLocation(id) {
  const state = load();
  state.locations = (state.locations ?? []).filter((l) => l.id !== id);
  if (DEFAULT_LOCATIONS.some((l) => l.id === id)) {
    state.removedDefaults = [...new Set([...(state.removedDefaults ?? []), id])];
  }
  save(state);
}

export function newLocationId() {
  return "loc_" + Math.random().toString(36).slice(2, 10);
}
