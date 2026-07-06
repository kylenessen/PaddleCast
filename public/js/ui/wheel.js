import { SECTOR_NAMES } from "../core/prefs.js";

// Direction wheel: an SVG donut with 16 compass slices the user clicks
// to toggle. Selected slices are the terrain-protected directions.
//
// Returns an element with a .getSelected() accessor.
export function directionWheel(selected, { onChange } = {}) {
  const chosen = new Set(selected ?? []);
  const size = 220;
  const c = size / 2;
  const rOuter = 100;
  const rInner = 55;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.classList.add("dir-wheel");

  const point = (r, deg) => {
    const rad = (deg - 90) * (Math.PI / 180);
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
  };

  for (let i = 0; i < 16; i++) {
    const start = i * 22.5 - 11.25;
    const end = start + 22.5;
    const [x1, y1] = point(rOuter, start);
    const [x2, y2] = point(rOuter, end);
    const [x3, y3] = point(rInner, end);
    const [x4, y4] = point(rInner, start);
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute(
      "d",
      `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} ` +
        `L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x4} ${y4} Z`
    );
    path.classList.add("dir-slice");
    path.classList.toggle("selected", chosen.has(i));
    path.addEventListener("click", () => {
      if (chosen.has(i)) chosen.delete(i);
      else chosen.add(i);
      path.classList.toggle("selected", chosen.has(i));
      onChange?.([...chosen].sort((a, b) => a - b));
    });
    svg.appendChild(path);

    const [lx, ly] = point((rOuter + rInner) / 2, i * 22.5);
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", lx);
    label.setAttribute("y", ly);
    label.classList.add("dir-label");
    label.textContent = SECTOR_NAMES[i];
    svg.appendChild(label);
  }

  const hint = document.createElementNS(svgNS, "text");
  hint.setAttribute("x", c);
  hint.setAttribute("y", c);
  hint.classList.add("dir-hint");
  hint.textContent = "protected";
  svg.appendChild(hint);

  svg.getSelected = () => [...chosen].sort((a, b) => a - b);
  return svg;
}
