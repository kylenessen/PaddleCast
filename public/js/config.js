// Runtime access to config.json, the hand-edited file at the site root
// that holds the shipped default filters and default locations. Edit
// that file (or use edit.html) and commit to change what everyone sees.
//
// The browser calls loadConfig() once at boot (app.js). The Pages
// Function loads the same file through its static-asset binding
// (functions/api/forecast.js). Until initConfig runs, the built-in
// fallbacks in core/prefs.js apply and the location list is empty.

let config = { version: 0, defaults: {}, locations: [], colors: {} };

export function initConfig(data) {
  config = {
    version: Number(data?.version) || 0,
    defaults: data?.defaults ?? {},
    locations: Array.isArray(data?.locations) ? data.locations : [],
    colors: data?.colors ?? {},
  };
}

// Deploy stamp used to detect a stale cached app (see app.js). Bump the
// "version" in config.json whenever the JS or HTML changes.
export function getConfigVersion() {
  return config.version;
}

export function getConfigDefaults() {
  return config.defaults;
}

// Optional per-scheme anchor color overrides, keyed by scheme id.
export function getConfigColors() {
  return config.colors;
}

export function getDefaultLocations() {
  return config.locations;
}

// no-cache revalidates against the server, so a fresh deploy shows up
// on the next page load instead of waiting out the browser cache.
export async function loadConfig() {
  const res = await fetch("config.json", { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`config.json failed to load (${res.status})`);
  }
  initConfig(await res.json());
}
