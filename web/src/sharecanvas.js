// Share-card canvas rendering — the PNG a player copies into a chat.
//
// PURE DRAWING. Every function here takes a plain data object and a canvas context and returns
// pixels; none of them reach into the app's state, the DOM, or the current game. The data-gathering
// counterparts (shareCardData, dynastyShareCardData, goatShareCardData) stay in app.js next to the
// state they read, which is the whole point of the split: what a card LOOKS like and what a card
// SAYS are two different jobs, and only the second one needs to know how the game works.
//
// Split out of app.js, which had grown to 4,472 lines. 323 lines of canvas work moved with a single
// external dependency (the look toggle), so this was the cheapest large piece to lift out.
//
// No club crests or player photos, ever — club identity is a coloured TEXT badge (drawBadge), the
// same rule the rest of the app follows.
import { isClassicLook, CROWN_PATH, FLAME_PATH, ARENA_PATH } from "./icons.js";

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A stylized half-court (basket at TOP, matching the in-app court) drawn into the box (x,y,w,h).
// `tint` (optional) is the home club's { color, abbr } — a soft colour wash + faint centre-court
// abbreviation, echoing the in-app home-court treatment.
function drawCourt(ctx, x, y, w, h, line, tint) {
  ctx.save();
  ctx.translate(x, y);
  rr(ctx, 0, 0, w, h, 18);
  ctx.save(); ctx.clip();
  if (tint) {
    ctx.fillStyle = tint.color; ctx.globalAlpha = 0.10; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.14; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = '800 150px "Inter", system-ui, sans-serif';
    ctx.fillText(tint.abbr, w / 2, h * 0.56);
    ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic";
  }
  ctx.strokeStyle = line; ctx.lineWidth = 3;
  const mid = w / 2;
  const keyW = w * 0.28, keyH = h * 0.34;
  ctx.strokeRect(mid - keyW / 2, 0, keyW, keyH);            // paint / key
  ctx.beginPath(); ctx.arc(mid, keyH, keyW * 0.5, 0, Math.PI * 2); ctx.stroke(); // FT circle
  ctx.beginPath(); ctx.moveTo(mid - 30, 16); ctx.lineTo(mid + 30, 16); ctx.stroke(); // backboard
  ctx.beginPath(); ctx.arc(mid, 30, 10, 0, Math.PI * 2); ctx.stroke(); // rim
  ctx.beginPath(); ctx.arc(mid, 30, w * 0.42, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke(); // 3pt arc
  ctx.restore();
  rr(ctx, 0, 0, w, h, 18); ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke(); // court edge
  ctx.restore();
}

// Draw an icon glyph (a 24-unit SVG path) onto the canvas at (x,y) top-left, `size` px tall —
// so the share card uses the SAME vector marks as the UI instead of OS emojis.
function drawGlyph(ctx, pathD, x, y, size, color, filled) {
  const s = size / 24;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  const p = new Path2D(pathD);
  if (filled) { ctx.fillStyle = color; ctx.fill(p); }
  else { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(p); }
  ctx.restore();
}

// Draw an icon + label as one group, centred on `cx` with the text baseline at `y`. ctx.font must be
// set already (used for both measuring and drawing); restores textAlign to "center" when done.
function drawGlyphLabel(ctx, pathD, label, cx, y, { size, gap, iconColor, iconFill, textColor, fontPx }) {
  const tw = ctx.measureText(label).width;
  const sx = cx - (size + gap + tw) / 2;
  drawGlyph(ctx, pathD, sx, (y - fontPx * 0.34) - size / 2, size, iconColor, iconFill);
  ctx.textAlign = "left"; ctx.fillStyle = textColor;
  ctx.fillText(label, sx + size + gap, y);
  ctx.textAlign = "center";
}

// Share-card DISPLAY font. Modern uses Archivo ExtraBold; Classic keeps the bold sans. Used for the
// title, mode label and the giant number — not for names/sentences. (copyCard preloads Archivo
// before drawing under Modern, so the canvas has the glyphs.)
const shareDisplayFont = (sz) => !isClassicLook()
  ? `800 ${sz}px "Archivo", "Inter", system-ui, sans-serif`
  : `800 ${sz}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;

// Render the finished team to an offscreen canvas.
export function buildShareCanvas(d) {
  const W = 1080, H = 1350, cx = W / 2;
  const BG = "#0e1420", PANEL = "#161d2c", LINE = "#39465c", INK = "#e7ecf3", MUTE = "#93a1b6",
    ACC = "#ff7d1a", GOOD = "#2ecc71", GOLD = "#e6c65a";
  const F = (wt, sz) => `${wt} ${sz}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#141d2e"); grad.addColorStop(0.5, BG); grad.addColorStop(1, "#0b111b");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(ctx, 18, 18, W - 36, H - 36, 22); ctx.stroke();
  ctx.textAlign = "center";

  // header — crown + wordmark
  ctx.font = shareDisplayFont(46);
  if (isClassicLook()) { ctx.fillStyle = INK; ctx.fillText("👑 KING OF EUROPE", cx, 96); }
  else drawGlyphLabel(ctx, CROWN_PATH, "KING OF EUROPE", cx, 96, { size: 46, gap: 14, iconColor: GOLD, iconFill: true, textColor: INK, fontPx: 46 });
  let modeText = d.modeLabel.toUpperCase();
  if (d.streak > 0) modeText += `   ·   🔥 ${d.streak}-DAY STREAK`;
  ctx.fillStyle = ACC; ctx.font = shareDisplayFont(24); ctx.fillText(modeText, cx, 134);

  // "1st in {country}" brag pill (only set when it's real — #1 with a big enough pool)
  if (d.brag) {
    ctx.font = shareDisplayFont(30);
    const bt = `🥇 ${d.brag.toUpperCase()}`, bw = ctx.measureText(bt).width;
    ctx.fillStyle = "rgba(230,198,90,0.16)"; rr(ctx, cx - bw / 2 - 22, 152, bw + 44, 44, 22); ctx.fill();
    ctx.fillStyle = GOLD; ctx.fillText(bt, cx, 182);
  }

  // record + stage
  ctx.fillStyle = d.perfect ? GOOD : INK; ctx.font = shareDisplayFont(150);
  ctx.fillText(`${d.wins}–${d.losses}`, cx, 300);
  const stageCol = d.stage === "champion" ? GOLD : d.stage === "lostfinal" || d.stage === "finalfour" ? ACC : MUTE;
  ctx.fillStyle = stageCol; ctx.font = F(700, 40);
  ctx.fillText(isClassicLook() && d.icon ? `${d.label} ${d.icon}` : d.label, cx, 356);

  // court + five
  const cx0 = 150, cy0 = 400, cw = 780, ch = 648;
  drawCourt(ctx, cx0, cy0, cw, ch, LINE, d.homeColor ? { color: d.homeColor, abbr: d.homeAbbr } : null);
  for (const p of d.five) {
    const px = cx0 + (p.x / 100) * cw, py = cy0 + (p.y / 100) * ch, R = 44;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.fillStyle = p.primary; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = p.secondary; ctx.stroke();
    ctx.fillStyle = MUTE; ctx.font = F(800, 18); ctx.fillText(p.slotLabel, px, py - R - 12);
    ctx.fillStyle = p.ink; ctx.font = F(800, 28); ctx.textBaseline = "middle";
    ctx.fillText(p.mono, px, py + 1); ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK; ctx.font = F(700, 25); ctx.fillText(p.name, px, py + R + 32);
    ctx.fillStyle = MUTE; ctx.font = F(600, 19); ctx.fillText(`${p.abbr} ${p.season}`, px, py + R + 58);
  }

  // HOME FLOOR — the arena gets its own prominent, white moment (not a muted footnote).
  if (d.arena) {
    ctx.font = F(800, 20);
    if (isClassicLook()) { ctx.fillStyle = MUTE; ctx.fillText("🏟  HOME FLOOR", cx, 1086); }
    else drawGlyphLabel(ctx, ARENA_PATH, "HOME FLOOR", cx, 1086, { size: 22, gap: 10, iconColor: MUTE, iconFill: false, textColor: MUTE, fontPx: 20 });
    ctx.fillStyle = INK; ctx.font = F(800, 42); ctx.fillText(d.arena, cx, 1132);
  }
  // two columns below: the 6th man (left) and the coach (right).
  const two = !!d.sixth;                 // old saved cards may predate the 6th-man field
  const lx = 300, rx = 780, colY = 1180; // column centres + label baseline
  if (two) {
    ctx.fillStyle = MUTE; ctx.font = F(800, 22); ctx.fillText("6TH MAN", lx, colY);
    ctx.fillStyle = INK; ctx.font = F(700, 32); ctx.fillText(d.sixth.name, lx, colY + 38);
    ctx.fillStyle = MUTE; ctx.font = F(600, 21); ctx.fillText(`${d.sixth.abbr} ${d.sixth.season}`, lx, colY + 66);
  }
  const coachX = two ? rx : cx;
  ctx.fillStyle = MUTE; ctx.font = F(800, 22); ctx.fillText("COACH", coachX, colY);
  ctx.fillStyle = INK; ctx.font = F(700, 32); ctx.fillText(d.coachName, coachX, colY + 38);
  if (d.coachStyle) { ctx.fillStyle = MUTE; ctx.font = F(600, 21); ctx.fillText(d.coachStyle, coachX, colY + 66); }

  // footer
  if (d.salary) { ctx.fillStyle = GOOD; ctx.font = F(700, 24); ctx.fillText(`Built for ${d.salary}`, cx, 1298); }
  ctx.fillStyle = ACC; ctx.font = F(700, 27);
  ctx.fillText("king-of-europe.pages.dev", cx, d.salary ? 1324 : 1300);
  return cv;
}

export function buildDynastyShareCanvas(d) {
  const W = 1080, H = 1350, cx = W / 2;
  const BG = "#0e1420", LINE = "#39465c", INK = "#e7ecf3", MUTE = "#93a1b6", ACC = "#ff7d1a", GOLD = "#e6c65a";
  const F = (wt, sz) => `${wt} ${sz}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#141d2e"); grad.addColorStop(0.5, BG); grad.addColorStop(1, "#0b111b");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(ctx, 18, 18, W - 36, H - 36, 22); ctx.stroke();
  ctx.textAlign = "center";

  ctx.font = shareDisplayFont(46);
  if (isClassicLook()) { ctx.fillStyle = INK; ctx.fillText("👑 KING OF EUROPE", cx, 96); }
  else drawGlyphLabel(ctx, CROWN_PATH, "KING OF EUROPE", cx, 96, { size: 46, gap: 14, iconColor: GOLD, iconFill: true, textColor: INK, fontPx: 46 });
  ctx.fillStyle = ACC; ctx.font = shareDisplayFont(24); ctx.fillText("DYNASTY", cx, 134);
  if (d.brag) {
    ctx.font = shareDisplayFont(30);
    const bt = `🥇 ${d.brag.toUpperCase()}`, bw = ctx.measureText(bt).width;
    ctx.fillStyle = "rgba(230,198,90,0.16)"; rr(ctx, cx - bw / 2 - 22, 152, bw + 44, 44, 22); ctx.fill();
    ctx.fillStyle = GOLD; ctx.fillText(bt, cx, 182);
  }

  const streakCol = d.streak >= 10 ? GOLD : ACC;
  ctx.font = shareDisplayFont(150);
  if (isClassicLook()) { ctx.fillStyle = streakCol; ctx.fillText(`🔥 ${d.streak}`, cx, 302); }
  else drawGlyphLabel(ctx, FLAME_PATH, `${d.streak}`, cx, 302, { size: 118, gap: 16, iconColor: streakCol, iconFill: true, textColor: streakCol, fontPx: 150 });
  ctx.fillStyle = MUTE; ctx.font = shareDisplayFont(30); ctx.fillText("WIN STREAK", cx, 352);
  ctx.fillStyle = INK; ctx.font = F(700, 26); ctx.fillText(d.subLabel, cx, 394);

  const cx0 = 150, cy0 = 436, cw = 780, ch = 660;
  drawCourt(ctx, cx0, cy0, cw, ch, LINE, d.homeColor ? { color: d.homeColor, abbr: d.homeAbbr } : null);
  for (const p of d.five) {
    const px = cx0 + (p.x / 100) * cw, py = cy0 + (p.y / 100) * ch, R = 42;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fillStyle = p.primary; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = p.secondary; ctx.stroke();
    ctx.fillStyle = MUTE; ctx.font = F(800, 17); ctx.fillText(p.slotLabel, px, py - R - 11);
    ctx.fillStyle = p.ink; ctx.font = F(800, 27); ctx.textBaseline = "middle"; ctx.fillText(p.mono, px, py + 1); ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK; ctx.font = F(700, 24); ctx.fillText(p.name, px, py + R + 30);
    ctx.fillStyle = MUTE; ctx.font = F(600, 18); ctx.fillText(`${p.abbr} ${p.season}`, px, py + R + 54);
  }

  let by = 1182;
  if (d.fellTo) { ctx.fillStyle = MUTE; ctx.font = F(700, 25); ctx.fillText(`Fell to ${d.fellTo}${d.fellScore ? "   " + d.fellScore : ""}`, cx, by); by += 44; }
  if (d.arena) {
    ctx.font = F(600, 22);
    if (isClassicLook()) { ctx.fillStyle = MUTE; ctx.fillText(`🏟  ${d.arena}`, cx, by); }
    else drawGlyphLabel(ctx, ARENA_PATH, d.arena, cx, by, { size: 24, gap: 9, iconColor: MUTE, iconFill: false, textColor: MUTE, fontPx: 22 });
  }
  ctx.fillStyle = ACC; ctx.font = F(700, 27); ctx.fillText("king-of-europe.pages.dev", cx, 1306);
  return cv;
}

// Draw the club's TEXT badge (colour-filled rounded rect with the abbreviation) — the same club
// identity the app uses everywhere. Text only; never a crest/logo. Centred in (x,y,w,h).
function drawBadge(ctx, x, y, w, h, b) {
  rr(ctx, x, y, w, h, 12);
  ctx.fillStyle = b.primary; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = b.secondary; ctx.stroke();
  let fs = 30; ctx.font = `800 ${fs}px "Inter", system-ui, sans-serif`;
  while (ctx.measureText(b.abbr).width > w - 18 && fs > 12) { fs -= 2; ctx.font = `800 ${fs}px "Inter", system-ui, sans-serif`; }
  ctx.fillStyle = b.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(b.abbr, x + w / 2, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
}

// Shrink the current font until `text` fits within `maxW` (keeps big names/labels on one line).
function fitFont(ctx, text, weight, startPx, maxW) {
  let px = startPx;
  ctx.font = `${weight} ${px}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
  while (ctx.measureText(text).width > maxW && px > 12) {
    px -= 2;
    ctx.font = `${weight} ${px}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
  }
  return px;
}

export function buildGoatShareCanvas(d) {
  const W = 1080, H = 1350, cx = W / 2;
  const BG = "#0e1420", PANEL = "#161d2c", LINE = "#39465c", INK = "#e7ecf3", MUTE = "#93a1b6",
    ACC = "#ff7d1a", GOOD = "#2ecc71", GOLD = "#e6c65a";
  const F = (wt, sz) => `${wt} ${sz}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#141d2e"); grad.addColorStop(0.5, BG); grad.addColorStop(1, "#0b111b");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(ctx, 18, 18, W - 36, H - 36, 22); ctx.stroke();
  ctx.textAlign = "center";

  // header — crown wordmark + G.O.A.T.
  ctx.font = shareDisplayFont(44);
  if (isClassicLook()) { ctx.fillStyle = INK; ctx.fillText("👑 KING OF EUROPE", cx, 92); }
  else drawGlyphLabel(ctx, CROWN_PATH, "KING OF EUROPE", cx, 92, { size: 44, gap: 14, iconColor: GOLD, iconFill: true, textColor: INK, fontPx: 44 });
  ctx.fillStyle = ACC; ctx.font = shareDisplayFont(26); ctx.fillText("G.O.A.T.", cx, 132);
  // (No "1st in {country}" pill on the G.O.A.T. card — it's dense here; the player name sits right
  // under the header. The brag lives on the Classic/Daily and Dynasty cards, which have the room.)

  // the mythical player's identity — club TEXT badge + name (no position), club/season beneath
  const bW = 100, bH = 66, bGap = 22;
  const namePx = fitFont(ctx, d.name, "800", 74, W - (d.badge ? 300 : 200));
  ctx.font = F(800, namePx);
  const nameW = ctx.measureText(d.name).width;
  if (d.badge) {
    const startX = cx - (bW + bGap + nameW) / 2;
    drawBadge(ctx, startX, 222 - namePx * 0.35 - bH / 2, bW, bH, d.badge);
    ctx.fillStyle = INK; ctx.font = F(800, namePx); ctx.textAlign = "left";
    ctx.fillText(d.name, startX + bW + bGap, 222);
    ctx.textAlign = "center";
  } else {
    ctx.fillStyle = INK; ctx.font = F(800, namePx); ctx.fillText(d.name, cx, 222);
  }
  ctx.fillStyle = MUTE; ctx.font = F(600, 26); ctx.fillText(d.club, cx, 268);

  // record + how the season entered the postseason (no stage-label line)
  ctx.fillStyle = d.perfect ? GOOD : (d.stage === "champion" ? GOLD : INK); ctx.font = shareDisplayFont(132);
  ctx.fillText(`${d.wins}–${d.losses}`, cx, 408);
  ctx.fillStyle = MUTE; ctx.font = F(700, 27); ctx.fillText(d.seedNote, cx, 452);

  // THE G.O.A.T. SEASON slam (only the full brag: 38-0 + title + MVP + F4 MVP)
  let statTop = 512;
  if (d.goatSeason) {
    ctx.font = F(800, 30);
    const slam = "★ THE G.O.A.T. SEASON ★";
    const sw = ctx.measureText(slam).width;
    ctx.fillStyle = "rgba(230,198,90,0.12)"; rr(ctx, cx - sw / 2 - 26, 484, sw + 52, 48, 12); ctx.fill();
    ctx.fillStyle = GOLD; ctx.fillText(slam, cx, 516);
    statTop = 560;
  }

  // FREAK STAT LINE — the hero: six stat cells (value / label / who it was grafted from) in 2×3.
  const cols = [W * 0.22, W * 0.5, W * 0.78], cellW = 300, cellH = 150, rowGap = 20;
  d.stats.forEach((s, i) => {
    const col = i % 3, row = (i / 3) | 0;
    const ccx = cols[col], top = statTop + row * (cellH + rowGap);
    ctx.fillStyle = PANEL; ctx.strokeStyle = LINE; ctx.lineWidth = 1.5;
    rr(ctx, ccx - cellW / 2, top, cellW, cellH, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = F(800, 52); ctx.fillText(String(s.val), ccx, top + 66);
    ctx.fillStyle = MUTE; ctx.font = F(700, 21); ctx.fillText(s.label.toUpperCase(), ccx, top + 100);
    const donorCol = s.src === "base" ? MUTE : ACC;
    ctx.fillStyle = donorCol; ctx.font = F(600, 22);
    fitFont(ctx, s.src, "600", 22, cellW - 30); ctx.fillText(s.src, ccx, top + 130);
  });
  let y = statTop + 2 * cellH + rowGap + 46;

  // awards — gold pills, wrapping if there are many
  if (d.awards.length) {
    ctx.font = F(700, 24);
    const padX = 22, gap = 14, lineH = 52;
    const widths = d.awards.map((a) => ctx.measureText(a).width + padX * 2);
    const lines = [[]]; let lw = 0;
    d.awards.forEach((a, i) => {
      const w = widths[i];
      if (lw + w + (lines[lines.length - 1].length ? gap : 0) > W - 120 && lines[lines.length - 1].length) { lines.push([]); lw = 0; }
      lines[lines.length - 1].push({ a, w }); lw += w + gap;
    });
    for (const ln of lines) {
      const total = ln.reduce((acc, p) => acc + p.w, 0) + gap * (ln.length - 1);
      let px = cx - total / 2;
      for (const p of ln) {
        ctx.fillStyle = "rgba(230,198,90,0.14)"; ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
        rr(ctx, px, y - 34, p.w, 44, 22); ctx.fill(); ctx.stroke();
        ctx.fillStyle = GOLD; ctx.textAlign = "center"; ctx.fillText(p.a, px + p.w / 2, y - 4);
        px += p.w + gap;
      }
      y += lineH;
    }
    y += 8;
  }

  // LINEUP — all five, the G.O.A.T. highlighted (gold + star). Chips in one centred row, shrunk to fit.
  ctx.fillStyle = MUTE; ctx.font = F(800, 22); ctx.fillText("LINEUP", cx, y); y += 52;
  const lineup = d.lineup || (d.cast || []).map((c) => ({ ...c, isGoat: false }));
  const chipH = 64, chipGap = 14, chipPad = 22;
  let lf = 25, chips, totalW;
  const measure = () => {
    ctx.font = F(700, lf);
    return lineup.map((p) => {
      const label = (p.isGoat ? "★ " : "") + p.pos + "  " + p.name;
      return { p, label, w: ctx.measureText(label).width + chipPad * 2 };
    });
  };
  do { chips = measure(); totalW = chips.reduce((a, c) => a + c.w, 0) + chipGap * (chips.length - 1); lf -= 1; }
  while (totalW > W - 60 && lf > 14);
  let px = cx - totalW / 2;
  for (const c of chips) {
    const top = y - chipH * 0.72;
    if (c.p.isGoat) { ctx.fillStyle = "rgba(230,198,90,0.16)"; ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; }
    else { ctx.fillStyle = PANEL; ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; }
    rr(ctx, px, top, c.w, chipH, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.p.isGoat ? GOLD : INK; ctx.font = F(c.p.isGoat ? 800 : 700, lf + 1);
    ctx.textBaseline = "middle"; ctx.fillText(c.label, px + c.w / 2, top + chipH / 2 + 1); ctx.textBaseline = "alphabetic";
    px += c.w + chipGap;
  }

  // footer
  ctx.fillStyle = ACC; ctx.font = F(700, 27); ctx.fillText("king-of-europe.pages.dev", cx, 1308);
  return cv;
}
