import { mergePrefs } from "../core/prefs.js";
import { buildPrefsForm, field, numberInput } from "./prefsform.js";
import { saveLocation, deleteLocation } from "../storage.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function section(title, hint) {
  const s = el("section", "settings-section");
  s.appendChild(el("h3", null, title));
  if (hint) s.appendChild(el("p", "hint", hint));
  return s;
}

// Settings form for a location. `location` may be freshly created (from
// the add-location map) or existing. Calls onSaved(location) after save.
export function renderSettings(location, { onSaved, onDeleted }) {
  const prefs = mergePrefs(location.prefs);
  const root = el("div", "settings-view");
  root.appendChild(el("h1", "loc-title", `${location.name} — Settings`));

  const form = el("form", "settings-form");

  // Basics
  const basics = section("Location");
  const nameInput = el("input");
  nameInput.type = "text";
  nameInput.value = location.name;
  nameInput.required = true;
  const latInput = numberInput(location.lat, { step: "any" });
  const lonInput = numberInput(location.lon, { step: "any" });
  basics.appendChild(field("Name", nameInput));
  const coordRow = el("div", "field-row");
  coordRow.appendChild(field("Latitude", latInput));
  coordRow.appendChild(field("Longitude", lonInput));
  basics.appendChild(coordRow);
  form.appendChild(basics);

  // Shared preference controls (wind, temp, sky, tide, waves).
  const prefsForm = buildPrefsForm(prefs);
  form.appendChild(prefsForm.element);

  // Actions
  const actions = el("div", "settings-actions");
  const saveBtn = el("button", "btn btn-primary", "Save");
  saveBtn.type = "submit";
  const deleteBtn = el("button", "btn btn-danger", "Delete location");
  deleteBtn.type = "button";
  actions.appendChild(saveBtn);
  actions.appendChild(deleteBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const updated = {
      ...location,
      name: nameInput.value.trim() || location.name,
      lat: parseFloat(latInput.value),
      lon: parseFloat(lonInput.value),
      prefs: prefsForm.read(),
    };
    saveLocation(updated);
    onSaved(updated);
  });

  deleteBtn.addEventListener("click", () => {
    if (confirm(`Delete ${location.name}?`)) {
      deleteLocation(location.id);
      onDeleted();
    }
  });

  root.appendChild(form);
  return root;
}
