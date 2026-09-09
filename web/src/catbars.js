// Category balance — the five bars beside the court, and the weak-link label under them.
//
// Pure presentation: every function takes numbers and returns geometry or markup. Nothing here reads
// the game state, so the same helpers serve the drafting sidebar, the mobile balance popup and the
// result card without any of them knowing about each other.
//
// The geometry and the weak-link label MUST agree. They once used different measures — score/mean for
// the bars, score-mean for the report — and disagreed about which category was shortest 55% of the
// time, so the write-up argued with the picture above it. Both now run on engine.catZ; if you change
// one, change the other in the same edit.
import { CATEGORIES, catZ } from "./engine.js";

// The bars are centred on TYPICAL, not on zero, and measured in engine.catZ. Two things that fixes:
//  · the shortest bar is a fair comparison. Dividing by the mean let the two volatile categories
//    (playmaking, efficiency) look shortest 63% of the time purely because their means are small.
//  · the middle of the track now MEANS something — a typical five sits at the centre line, better
//    than it right, worse left — instead of the centre being "zero", which no real five is near.
// It still builds as you draft: median z runs -1.66 -> -1.10 -> -0.61 -> -0.19 -> -0.06 across the
// five picks, so the bars fill rightward toward the centre as the five comes together.
const Z_SPAN = 2.6;     // z at which a bar reaches the end of its half (p99 of finished fives)
const BAR_CURVE = 1.0;  // linear in z — the curve existed to slow a ratio that jumped on pick one
export function catBarGeom(score, k) {
  const z = catZ(score, k);
  const ratio = Math.min(1, Math.abs(z) / Z_SPAN);
  const width = 50 * Math.pow(ratio, BAR_CURVE);
  return { left: z >= 0 ? 50 : 50 - width, width };
}
// The DISPLAYED weak point is the SHORTEST BAR, measured the same way the bar is drawn, so the
// highlighted category is always visibly the shortest one. (The engine keeps its OWN `gateCategory`
// for the simulation; that one is judged against a different reference and can legitimately differ.)
export function weakestBarCat(categoryScores) {
  let worst = CATEGORIES[0], wv = Infinity;
  for (const k of CATEGORIES) {
    const v = catZ(categoryScores ? categoryScores[k] || 0 : 0, k); // same measure the bar is drawn in
    if (v < wv) { wv = v; worst = k; }
  }
  return worst;
}
export const capCat = (k) => k.charAt(0).toUpperCase() + k.slice(1); // "defense" -> "Defense"
export function catBarsHTML(res) {
  const gateCat = res ? weakestBarCat(res.categoryScores) : null;
  return CATEGORIES.map((k) => {
    const g = catBarGeom(res ? res.categoryScores[k] : 0, k);
    return `<div class="cat-row${k === gateCat ? " isgate" : ""}"><span class="lbl">${capCat(k)}</span>` +
      `<div class="cat-track"><div class="cat-fill" style="left:${g.left}%; width:${g.width}%"></div></div></div>`;
  }).join("");
}

// Update the drafting bars IN PLACE (don't rebuild the DOM), so the CSS transition animates each
// change smoothly instead of snapping - the elements persist between picks and only their
// width/position move.
export function updateCatBars(container, res) {
  const gateCat = res ? weakestBarCat(res.categoryScores) : null;
  if (container.dataset.built !== "1") {
    container.innerHTML = CATEGORIES.map((k) =>
      `<div class="cat-row" data-cat="${k}"><span class="lbl">${capCat(k)}</span>` +
      `<div class="cat-track"><div class="cat-fill"></div></div></div>`).join("");
    container.dataset.built = "1";
  }
  for (const k of CATEGORIES) {
    const row = container.querySelector(`.cat-row[data-cat="${k}"]`);
    const fill = row.querySelector(".cat-fill");
    const g = catBarGeom(res ? res.categoryScores[k] : 0, k);
    fill.style.left = g.left + "%";
    fill.style.width = g.width + "%";
    row.classList.toggle("isgate", k === gateCat);
  }
}
