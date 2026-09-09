import { CATEGORIES, CAT_TYPICAL, catRatio } from "./engine.js";

// The bars GROW as you draft. Each shows the running total as a share of that category's typical
// level, on a convex curve so one early pick — even a star whose single-category score can rival a
// whole five — only nudges the bar and it fills in as the picks stack up. An untouched board is 0 in
// every category and draws nothing.
//
// This is deliberate and has been reverted back to once. A centre-anchored version, measuring each
// category as a distance above or below typical, is arguably more informative and is much worse to
// use: a part-built roster is below a finished one in every category, so the bars sat left of centre
// and lurched about with every pick. Watching them build is the point.
//
// The weak-link label runs on the SAME ratio, so the highlighted category is always visibly the
// shortest bar.
const CAT_SPAN = 2.2;   // a category at ~this x its typical level fills the half-bar
const BAR_CURVE = 1.35; // >1 -> early/small totals barely move the bar (gradual build-up)
export function catBarGeom(score, k) {
  const ratio = Math.min(1, Math.abs(score) / (CAT_TYPICAL[k] * CAT_SPAN));
  const width = 50 * Math.pow(ratio, BAR_CURVE);
  return { left: score >= 0 ? 50 : 50 - width, width };
}
export function weakestBarCat(categoryScores) {
  let worst = CATEGORIES[0], wv = Infinity;
  for (const k of CATEGORIES) {
    const v = catRatio(categoryScores ? categoryScores[k] || 0 : 0, k); // the measure the bar is drawn in
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
