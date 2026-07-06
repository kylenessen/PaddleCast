// All persistence lives in localStorage on the user's device. No
// accounts, no server-side state.

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
  return load().locations ?? [];
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
  save(state);
}

export function newLocationId() {
  return "loc_" + Math.random().toString(36).slice(2, 10);
}
