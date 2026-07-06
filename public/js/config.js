// Runtime access to config.json, the hand-edited file at the site root
// that holds the shipped default filters and default locations. Edit
// that file (or use edit.html) and commit to change what everyone sees.
//
// The browser calls loadConfig() once at boot (app.js). The Pages
// Function loads the same file through its static-asset binding
// (functions/api/forecast.js). Until initConfig runs, the built-in
// fallbacks in core/prefs.js apply and the location list is empty.

let config = { defaults: {}, locations: [] };

export function initConfig(data) {
  config = {
    defaults: data?.defaults ?? {},
    locations: Array.isArray(data?.locations) ? data.locations : [],
  };
}

export function getConfigDefaults() {
  return config.defaults;
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
