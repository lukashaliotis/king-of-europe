// Inline-SVG icon set — vector glyphs in the app's own palette (they take `currentColor`), used in
// place of OS emojis so the chrome renders identically on every platform and can be recoloured
// (accent, gold, muted). Self-contained: no icon font, no CDN — same approach as the arena flames.
//
// Style: line icons (stroke, no fill) EXCEPT the ones in SOLID, which are filled silhouettes.

// Single-path `d` strings for the glyphs we also draw on the <canvas> share card (via Path2D).
export const FLAME_PATH = "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";
export const CROWN_PATH = "M3 19 5.5 8 9.5 13 12 5 14.5 13 18.5 8 21 19Z";
export const ARENA_PATH = "M3 22H21M6 18V11M10 18V11M14 18V11M18 18V11M12 2 20 7H4Z";

const SOLID = new Set(["flame", "crown"]); // filled silhouettes; everything else is a stroked line icon

const ICONS = {
  flame: `<path d="${FLAME_PATH}"/>`,
  crown: `<path d="${CROWN_PATH}"/><circle cx="5.5" cy="6.5" r="1.3"/><circle cx="12" cy="3.8" r="1.5"/><circle cx="18.5" cy="6.5" r="1.3"/>`,
  spin: `<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>`,
  scale: `<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>`,
  ball: `<circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M2 12h20"/><path d="M5 5c3 3 3 11 0 14"/><path d="M19 5c-3 3-3 11 0 14"/>`,
  star: `<path d="M12 2.5 15 9l6.5.7-4.8 4.4L18.8 21 12 17.5 5.2 21l1.1-6.9L1.5 9.7 8 9z"/>`,
  trophy: `<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>`,
  moon: `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>`,
  calendar: `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/>`,
  coins: `<circle cx="12" cy="12" r="9"/><path d="M15 8.6a4 4 0 1 0 0 6.8"/><path d="M7.4 11h6.4"/><path d="M7.4 13.4h5.4"/>`,
  swords: `<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/>`,
  arena: `<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>`,
  home: `<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>`,
  plane: `<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>`,
  infinity: `<path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/>`,
  lock: `<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  chart: `<path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V8"/><path d="M17 16v-3"/>`,
  copy: `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  medal: `<path d="M7.5 3 10 8"/><path d="M16.5 3 14 8"/><circle cx="12" cy="15" r="6"/><path d="M12 12.5l.9 1.8 2 .3-1.45 1.4.34 2-1.79-.94-1.79.94.34-2L10.1 14.6l2-.3z"/>`,
  bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>`,
  target: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>`,
  info: `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`,
  globe: `<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`,
  clock: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  shield: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
  flag: `<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>`,
};

// CLASSIC look: the original emoji for each glyph. When data-look="classic", icon() returns these
// instead of the SVG, so the whole app reverts to the pre-redesign emoji feel via one switch.
const EMOJI = {
  flame: "🔥", crown: "👑", trophy: "🏆", moon: "🌙", sun: "☀️", calendar: "🗓️", coins: "💰",
  swords: "⚔️", arena: "🏟️", home: "🏠", plane: "✈️", infinity: "♾️", lock: "🔒", chart: "📊",
  copy: "📋", spin: "🎰", scale: "⚖️", ball: "🏀", star: "⭐", gear: "⚙️",
  medal: "🏅", bolt: "⚡", target: "💯", info: "ℹ️",
  globe: "🌍", clock: "🕰️", shield: "🛡️", flag: "🚩",
};

export const isClassicLook = () =>
  typeof document !== "undefined" && document.documentElement.getAttribute("data-look") === "classic";

/** Markup for `name`: an SVG glyph (modern look) or the original emoji (classic look). */
export function icon(name, cls = "") {
  if (isClassicLook() && EMOJI[name]) return `<span class="ic-emoji ${cls}" aria-hidden="true">${EMOJI[name]}</span>`;
  const inner = ICONS[name];
  if (!inner) return "";
  const solid = SOLID.has(name) ? " solid" : "";
  return `<svg class="ic${solid}${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}
