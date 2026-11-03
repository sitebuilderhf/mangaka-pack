// Mangaka Pack engine (generated from app/index.src.html)
const LOGO_SRC = "logo.png";
const WMSTACK_SRC = "wmstack.png";
// Third-party code is vendored under /public/vendor (fetched through the Socket registry,
// integrity-checked, exact versions) and loaded same-origin on first use.
// relative to the page (worker) and to this module (dynamic import); both live at the site root
const PDFJS = "./";
const MP4_MUXER = "./mp4-muxer.mjs";
const vendorImport = (url) => import(/* @vite-ignore */ url);
const CLOSING_SRC = "closing.mp4"; // Higgsfield Mangaka tutorial, the last slide of every carousel

const S = {
  pages: [], photos: [], logo: null, wm: null,
  fmt: "reels", speed: { reels: 2.5, car: 5.2 }, vidPages: 3, fps: 30,
  slide: 0, playing: true, t0: performance.now(), busy: false,
};
const $ = (id) => document.getElementById(id);
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- shared drawing helpers ---------- */
function drawCover(ctx, img, x, y, w, h, fx = 0.5, fy = 0.5) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) * fx, (img.height - sh) * fy, sw, sh, x, y, w, h);
}
function drawContain(ctx, img, x, y, w, h) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function stackHeight(w, gap) {
  return S.pages.reduce((a, p, i) => a + w * p.height / p.width + (i ? gap : 0), 0);
}
function drawStack(ctx, pages, x, y, w, h, scroll, gap, bg) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  let py = y - scroll;
  for (const p of pages) {
    const ph = w * p.height / p.width;
    if (py + ph > y && py < y + h) ctx.drawImage(p, x, py, w, ph);
    py += ph + gap;
  }
  ctx.restore();
}
/* hold, ease in, cruise, ease out, hold */
function scrollAt(t, dist, holdIn, scrollDur, ramp = 0.8) {
  const T = Math.max(scrollDur, 2 * ramp + 0.01);
  const u = clamp(t - holdIn, 0, T);
  const v = dist / (T - ramp);
  if (u < ramp) return 0.5 * v * u * u / ramp;
  if (u < T - ramp) return 0.5 * v * ramp + v * (u - ramp);
  const k = T - u;
  return dist - 0.5 * v * k * k / ramp;
}
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const cur = out.length ? out[out.length - 1] : null;
    if (cur !== null && ctx.measureText(cur + " " + word).width <= maxW) out[out.length - 1] = cur + " " + word;
    else out.push(word);
  }
  return out;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
/* Lay 1 to 4 input photos into a box: 1 fills it; 2 sit side by side or stacked, whichever
   crops the photos less; 3 is one wide on top and two below; 4 is a 2x2 grid. */
function keepRatio(cellAspect, photoAspect) { return Math.min(cellAspect / photoAspect, photoAspect / cellAspect); }
function photoCells(photos, x, y, w, h, gap) {
  const n = photos.length;
  if (n <= 1) return [[x, y, w, h]];
  const pa = photos.reduce((a, p) => a + p.width / p.height, 0) / n;
  if (n === 2) {
    const side = keepRatio((w - gap) / 2 / h, pa), stack = keepRatio(w / ((h - gap) / 2), pa);
    return side >= stack
      ? [[x, y, (w - gap) / 2, h], [x + (w + gap) / 2, y, (w - gap) / 2, h]]
      : [[x, y, w, (h - gap) / 2], [x, y + (h + gap) / 2, w, (h - gap) / 2]];
  }
  const hw = (w - gap) / 2, hh = (h - gap) / 2;
  if (n === 3) return [[x, y, w, hh], [x, y + hh + gap, hw, hh], [x + hw + gap, y + hh + gap, hw, hh]];
  return [[x, y, hw, hh], [x + hw + gap, y, hw, hh], [x, y + hh + gap, hw, hh], [x + hw + gap, y + hh + gap, hw, hh]];
}
/* framed panels: photos fill their cells (cropped toward the faces) with a black frame */
function drawPhotoGrid(ctx, photos, x, y, w, h, gap, framed) {
  photoCells(photos, x, y, w, h, gap).forEach(([cx, cy, cw, ch], i) => {
    drawCover(ctx, photos[i], cx, cy, cw, ch, 0.5, photos.length > 1 ? 0.2 : 0.08);
    if (framed) frameBox(ctx, cx, cy, cw, ch);
  });
}
/* ---------- Reel 9:16 (manga full screen, input card, prompt) ---------- */
const RW = 1080, RH = 1920;
function reelOverlay() {
  const c = mk(RW, RH), x = c.getContext("2d");
  // bottom fade: 0 above 980, eases to 238/255 by 1400, then to solid
  const g = x.createLinearGradient(0, 980, 0, RH);
  for (let i = 0; i <= 24; i++) {
    const y = 980 + (RH - 980) * i / 24;
    let a = y <= 1400 ? Math.pow((y - 980) / 420, 1.6) * 238 : 238 + (y - 1400) / (RH - 1400) * 17;
    g.addColorStop(i / 24, `rgba(0,0,0,${(a / 255).toFixed(3)})`);
  }
  x.fillStyle = g; x.fillRect(0, 980, RW, RH - 980);

  // input polaroids, tilted, bottom right; 2 to 4 photos fan out to the left
  const n = S.photos.length;
  const scale = n === 1 ? 1 : n === 2 ? 0.9 : 0.78;
  const angles = [[4], [-7, 5], [-9, 0, 8], [-10, -3, 4, 10]][n - 1];
  const yoff = [[0], [18, -6], [22, 0, 14], [24, 4, 16, 0]][n - 1];
  const cw = Math.round(232 * scale), ch = Math.round(290 * scale), bd = Math.round(10 * scale);
  const cardW = cw + 2 * bd, cardH = ch + 2 * bd, step = cardW * 0.56;
  const lastX = RW - 64 - cardW / 2 - 10;
  const centers = S.photos.map((_, i) => [lastX - (n - 1 - i) * step, 1030 + cardH / 2 + yoff[i]]);
  S.photos.forEach((photo, i) => {
    const card = mk(cardW, cardH), cx2 = card.getContext("2d");
    cx2.fillStyle = "#fff"; roundRect(cx2, 0, 0, cardW, cardH, 22 * scale); cx2.fill();
    cx2.save(); roundRect(cx2, bd, bd, cw, ch, 14 * scale); cx2.clip(); drawCover(cx2, photo, bd, bd, cw, ch, 0.5, 0.1); cx2.restore();
    x.save();
    x.translate(centers[i][0], centers[i][1]); x.rotate(-angles[i] * Math.PI / 180);
    x.shadowColor = "rgba(0,0,0,0.65)"; x.shadowBlur = 48; x.shadowOffsetY = 14;
    x.drawImage(card, -cardW / 2, -cardH / 2);
    x.restore();
  });
  // "Input" pill on the first card's corner
  x.font = "900 34px Inter"; x.textBaseline = "middle";
  const tw = x.measureText("Input").width, lx = centers[0][0] - cardW / 2 - 18, ly = 1030 + yoff[0] - 22;
  x.fillStyle = "#fff"; roundRect(x, lx, ly, tw + 44, 56, 28); x.fill();
  x.fillStyle = "#000"; x.fillText("Input", lx + 22, ly + 29);

  // Higgsfield Mangaka lockup with a soft dark glow
  x.save(); x.shadowColor = "rgba(0,0,0,0.75)"; x.shadowBlur = 36;
  x.drawImage(S.wm, 64, 1150); x.restore();

  // prompt
  x.textBaseline = "top"; x.fillStyle = "#fff"; x.font = "900 64px Inter";
  x.fillText("Prompt", 64, 1352);
  const paras = ($("prompt").value || "").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const maxW = RW - 128, maxH = 1760 - 1450;
  let size = 30, lines;
  for (; size >= 15; size -= 0.5) {
    x.font = `600 ${size}px Inter`;
    lines = []; let h = 0;
    paras.forEach((p, i) => {
      if (i) { lines.push(null); h += size * 0.7; }
      for (const l of wrapLines(x, p, maxW)) { lines.push(l); h += size * 1.3; }
    });
    if (h <= maxH) break;
  }
  x.fillStyle = "#ebebeb";
  let y = 1448;
  for (const l of lines || []) {
    if (l === null) { y += size * 0.7; continue; }
    x.fillText(l, 64, y); y += size * 1.3;
  }
  return c;
}
function reelTiming() {
  const dist = Math.max(0, stackHeight(RW, 0) - RH);
  const scrollDur = S.speed.reels * S.pages.length;
  return { dist, holdIn: 1.2, scrollDur, dur: 1.2 + scrollDur + 1.6 };
}
let reelCache = null;
function reelFrame(ctx, t) {
  const tm = reelTiming();
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, RW, RH);
  drawStack(ctx, S.pages, 0, 0, RW, RH, Math.round(scrollAt(t, tm.dist, tm.holdIn, tm.scrollDur)), 0, "#000");
  if (!reelCache) reelCache = reelOverlay();
  ctx.drawImage(reelCache, 0, 0);
}

/* ---------- Carousel 5:4 (photo left, manga scroll right) + book spreads ---------- */
const CW = 1350, CH = 1080, M = 22, GAP = 16, BORDER = 3;
const COL_W = (CW - 2 * M - GAP) / 2, COL_H = CH - 2 * M;
const LX = M, RX = M + COL_W + GAP;
const PAGE_GAP = 26;
function frameBox(ctx, x, y, w, h) {
  ctx.lineWidth = BORDER; ctx.strokeStyle = "#000";
  ctx.strokeRect(x - BORDER / 2, y - BORDER / 2, w + BORDER, h + BORDER);
}
function drawLogo(ctx, W, H) {
  const l = S.logo;
  ctx.drawImage(l, (W - l.width) / 2, H - M - l.height + 18);
}
/* "more →" badge: lime disc, ink ring, hard manga shadow; nudges right in the video */
/* "next" badge: lime disc, ink ring, hard manga shadow. It breathes (slow pulse) and sends out
   a fading ring every BREATH seconds. */
const BREATH = 1.6, SPREAD_DUR = 4.8; // spread videos hold three full breaths
function drawNext(ctx, W, H, t, scale = 1) {
  const r = 40, cx = W - M - 66, cy = H - M - 55;
  const ph = (t % BREATH) / BREATH;
  const breath = 1 + 0.07 * Math.sin(ph * Math.PI * 2);
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
  // ring reads on light paper and dark manga alike: ink outline with a lime core
  ctx.globalAlpha = 0.8 * (1 - ph);
  ctx.beginPath(); ctx.arc(cx, cy, r * (1 + 0.65 * ph), 0, Math.PI * 2);
  ctx.lineWidth = 6; ctx.strokeStyle = "#000"; ctx.stroke();
  ctx.lineWidth = 2.5; ctx.strokeStyle = "#d1fe17"; ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.translate(cx, cy); ctx.scale(breath, breath); ctx.translate(-cx, -cy);
  ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx + 5, cy + 5, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#d1fe17"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.stroke();
  ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 14, cy);
  ctx.moveTo(cx + 1, cy - 13); ctx.lineTo(cx + 15, cy); ctx.lineTo(cx + 1, cy + 13); ctx.stroke();
  ctx.restore();
}
function spreadFrame(ctx, i, t) {
  ctx.drawImage(spreads[i], 0, 0);
  drawNext(ctx, CW, CH, t); // the closing video always follows
}
/* closing slide: the tutorial video, shipped as-is in the export and drawn live in the preview */
let closingVid = null;
function closingVideo() {
  if (!closingVid) {
    closingVid = document.createElement("video");
    Object.assign(closingVid, { src: CLOSING_SRC, muted: true, loop: true, playsInline: true, preload: "auto" });
    closingVid.addEventListener("loadeddata", () => { if (S.fmt === "car") buildPager(); }, { once: true });
  }
  return closingVid;
}
function closingFrame(ctx) {
  const v = closingVideo();
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, CW, CH);
  if (v.readyState >= 2) ctx.drawImage(v, 0, 0, CW, CH);
  else {
    ctx.fillStyle = "#9aa19f"; ctx.font = "600 30px Manrope, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Loading the closing video…", CW / 2, CH / 2); ctx.textAlign = "start";
  }
}
function vidPagesList() { return S.pages.slice(0, Math.min(S.vidPages, S.pages.length)); }
function carTiming() {
  const pages = vidPagesList();
  const h = pages.reduce((a, p, i) => a + COL_W * p.height / p.width + (i ? PAGE_GAP : 0), 0);
  const dist = Math.max(0, h - COL_H);
  const scrollDur = S.speed.car * pages.length;
  return { dist, holdIn: 1.0, scrollDur, dur: 1.0 + scrollDur + 2.0 };
}
let boardCache = null;
function carVideoFrame(ctx, t) {
  if (!boardCache) {
    boardCache = mk(CW, CH);
    const b = boardCache.getContext("2d");
    b.fillStyle = "#fff"; b.fillRect(0, 0, CW, CH);
    drawPhotoGrid(b, S.photos, LX, M, COL_W, COL_H, GAP, true);
    frameBox(b, RX, M, COL_W, COL_H);
  }
  const tm = carTiming();
  ctx.drawImage(boardCache, 0, 0);
  drawStack(ctx, vidPagesList(), RX, M, COL_W, COL_H, Math.round(scrollAt(t, tm.dist, tm.holdIn, tm.scrollDur)), PAGE_GAP, "#fff");
  drawLogo(ctx, CW, CH);
  // the arrow pops in once the scroll has reached the end
  const te = t - (tm.holdIn + tm.scrollDur);
  if (te > 0) {
    const u = Math.min(te / 0.4, 1), c1 = 1.7, c3 = c1 + 1;
    drawNext(ctx, CW, CH, te, 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2)); // ease-out-back
  }
}

const PW = 580, PH = 870, BOOK_BG = "#f0eee9";
function bookPage(img, side) {
  const c = mk(PW, PH), x = c.getContext("2d");
  x.fillStyle = "#fbf9f4"; x.fillRect(0, 0, PW, PH);
  const bw = PW - 54, bh = PH - 62, x0 = side === "L" ? 24 : 30;
  if (img) drawContain(x, img, x0, 28, bw, bh); // no img: a blank closing page
  // gutter shadow + highlight, measured from the spine
  const g = side === "L" ? x.createLinearGradient(PW, 0, 0, 0) : x.createLinearGradient(0, 0, PW, 0);
  for (const d of [0, 15, 30, 45, 60, 75, 90, 105, 120, 300, PW]) {
    const a = 0.55 * Math.pow(Math.max(0, 1 - d / 120), 2) + 0.05 * d / PW;
    g.addColorStop(d / PW, `rgba(0,0,0,${a.toFixed(3)})`);
  }
  x.fillStyle = g; x.fillRect(0, 0, PW, PH);
  const h = side === "L" ? x.createLinearGradient(PW, 0, 0, 0) : x.createLinearGradient(0, 0, PW, 0);
  h.addColorStop(60 / PW, "rgba(255,255,255,0)"); h.addColorStop(120 / PW, "rgba(255,255,255,0.10)"); h.addColorStop(180 / PW, "rgba(255,255,255,0)");
  x.fillStyle = h; x.fillRect(0, 0, PW, PH);
  return c;
}
function drawCurved(ctx, pc, side, dx, dy) {
  const depth = 16, reach = 260, step = 4;
  for (let sx = 0; sx < PW; sx += step) {
    const d = side === "L" ? PW - sx : sx;
    const o = depth * Math.pow(Math.max(0, 1 - d / reach), 2);
    ctx.drawImage(pc, sx, 0, step, PH, dx + sx, dy + o, step + 0.5, PH - 2 * o);
  }
}
function bookSpread(left, right) {
  const c = mk(CW, CH), x = c.getContext("2d");
  x.fillStyle = BOOK_BG; x.fillRect(0, 0, CW, CH);
  const bx = (CW - 2 * PW) / 2, by = 46;
  x.save();
  x.shadowColor = "rgba(0,0,0,0.35)"; x.shadowBlur = 60; x.shadowOffsetY = 34;
  x.fillStyle = "#1c1c20"; roundRect(x, bx - 16, by - 10, 2 * PW + 32, PH + 32, 12); x.fill();
  x.restore();
  for (const k of [4, 3, 2, 1]) {
    x.fillStyle = "#ece8e0"; x.fillRect(bx - 2 * k, by + k, 2 * PW + 4 * k, PH + k);
    x.strokeStyle = "#cdc8be"; x.lineWidth = 1; x.strokeRect(bx - 2 * k + 0.5, by + k + 0.5, 2 * PW + 4 * k - 1, PH + k - 1);
  }
  drawCurved(x, bookPage(left, "L"), "L", bx, by);
  drawCurved(x, bookPage(right, "R"), "R", bx + PW, by);
  x.strokeStyle = "#78746c"; x.lineWidth = 2;
  x.beginPath(); x.moveTo(bx + PW, by + 8); x.lineTo(bx + PW, by + PH - 8); x.stroke();
  drawLogo(x, CW, CH);
  return c;
}
function carSlides() {
  const rest = S.pages.slice(Math.min(S.vidPages, S.pages.length));
  const out = [];
  for (let i = 0; i < rest.length; i += 2) {
    // spreads show only manga; an odd last page faces a blank page, like the end of a real book
    out.push(bookSpread(rest[i], rest[i + 1] || null));
  }
  return out;
}

/* ---------- preview ---------- */
let spreads = [];
function rebuild() {
  reelCache = null; boardCache = null; spreads = [];
  const view = $("view");
  if (S.fmt === "reels") { view.width = RW; view.height = RH; view.classList.add("tall"); }
  else { view.width = CW; view.height = CH; view.classList.remove("tall"); }
  $("export").disabled = !ready();
  if (!ready()) { $("pager").hidden = true; updateMeta(); drawEmpty(); return; }
  if (S.fmt === "car") spreads = carSlides();
  S.t0 = performance.now();
  S.slide = clamp(S.slide, 0, spreads.length + 1);
  buildPager();
  updateMeta();
  draw(true);
}
function ready() { return S.pages.length && S.photos.length && S.logo && S.wm; }
/* empty state: what the preview needs before it can render */
function drawEmpty() {
  const view = $("view"), ctx = view.getContext("2d"), W = view.width, H = view.height;
  ctx.fillStyle = "#151718"; ctx.fillRect(0, 0, W, H);
  ctx.setLineDash([18, 14]); ctx.lineWidth = 4; ctx.strokeStyle = "#3a3f40";
  roundRect(ctx, 40, 40, W - 80, H - 80, 28); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#eef0ee"; ctx.font = "800 76px 'Bricolage Grotesque', sans-serif";
  ctx.fillText("Your post shows up here", W / 2, H / 2 - 110);
  ctx.font = "600 44px Manrope, sans-serif";
  const rows = [["Manga (PDF or page images)", S.pages.length > 0], ["Input photo", S.photos.length > 0]];
  rows.forEach(([label, ok], i) => {
    ctx.fillStyle = ok ? "#d1fe17" : "#a2a8a6";
    ctx.fillText(`${label}: ${ok ? "added" : "needed"}`, W / 2, H / 2 + 10 + i * 70);
  });
  ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
}
function buildPager() {
  const pager = $("pager");
  pager.hidden = S.fmt !== "car";
  pager.innerHTML = "";
  if (S.fmt !== "car") return;
  const items = [null, ...spreads, "closing"];
  items.forEach((sp, i) => {
    const b = document.createElement("button");
    const closing = sp === "closing";
    b.setAttribute("aria-label", closing ? `Slide ${i + 1}, closing video` : i ? `Slide ${i + 1}` : "Slide 1, video");
    b.setAttribute("aria-current", String(i === S.slide));
    const th = mk(192, 154), tx = th.getContext("2d");
    const f = mk(CW, CH);
    if (closing) closingFrame(f.getContext("2d"));
    else if (sp) spreadFrame(f.getContext("2d"), i - 1, 0); else carVideoFrame(f.getContext("2d"), 0);
    tx.drawImage(f, 0, 0, 192, 154);
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = closing ? `${String(i + 1).padStart(2, "0")} · end` : i ? String(i + 1).padStart(2, "0") : "01 · scroll";
    b.append(th, lbl);
    b.onclick = () => { S.slide = i; S.t0 = performance.now(); [...pager.children].forEach((c, j) => c.setAttribute("aria-current", String(j === i))); draw(true); };
    pager.append(b);
  });
}
function updateMeta() {
  $("speedOut").textContent = S.speed[S.fmt].toFixed(1) + " s";
  $("vidPagesOut").textContent = String(S.vidPages);
  if (!ready()) {
    $("meta").textContent = S.fmt === "reels" ? "Reel · 1080×1920" : "Carousel · 1350×1080";
    $("fmtNote").textContent = S.fmt === "reels"
      ? "One MP4. The manga fills the screen and scrolls under your prompt."
      : "Every slide is a video: the first pages scroll next to your photo, then book spreads, then the Higgsfield Mangaka tutorial. Exports as one ZIP.";
    return;
  }
  const n = S.pages.length;
  if (S.fmt === "reels") {
    const tm = reelTiming();
    $("meta").textContent = `Reel · ${n} pages · ${tm.dur.toFixed(1)} s`;
    $("fmtNote").textContent = "One MP4. The manga fills the screen and scrolls under your prompt.";
  } else {
    const tm = carTiming(), total = 2 + spreads.length;
    $("meta").textContent = `Carousel · ${total} slides · video ${tm.dur.toFixed(1)} s`;
    $("fmtNote").textContent = total > 20
      ? `Instagram allows 20 slides; this manga makes ${total}. Use fewer pages or post two carousels.`
      : `Every slide is a video: slide 1 scrolls the first pages, then come the book spreads, and slide ${total} is the Higgsfield Mangaka tutorial. Exports as one ZIP.`;
  }
  $("speedOut").textContent = S.speed[S.fmt].toFixed(1) + " s";
  $("vidPagesOut").textContent = String(S.vidPages);
}
function draw(force) {
  if (!ready()) return;
  const ctx = $("view").getContext("2d");
  const t = (performance.now() - S.t0) / 1000;
  if (S.fmt === "reels") { const d = reelTiming().dur; reelFrame(ctx, S.playing ? t % d : 0); }
  else if (S.slide === 0) { const d = carTiming().dur; carVideoFrame(ctx, S.playing ? t % d : 0); }
  else if (S.slide === spreads.length + 1) {
    const v = closingVideo();
    if (S.playing && v.paused) v.play().catch(() => {});
    if (!S.playing && !v.paused) v.pause();
    closingFrame(ctx);
  }
  else spreadFrame(ctx, S.slide - 1, S.playing ? t % SPREAD_DUR : 0);
  if (closingVid && S.slide !== spreads.length + 1 && !closingVid.paused) closingVid.pause();
}
function loop() {
  if (S.playing && !S.busy) draw(false);
  requestAnimationFrame(loop);
}

/* ---------- loading ---------- */
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
let pdfReady = null;
function ensurePdf() {
  if (!pdfReady) pdfReady = (async () => {
    const lib = await vendorImport(PDFJS + "pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs";
    return lib;
  })();
  return pdfReady;
}
async function pagesFromPdf(file) {
  const pdfjs = await ensurePdf();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    setStatus(`Reading page ${i} of ${doc.numPages}…`);
    const pg = await doc.getPage(i);
    const vp0 = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: 1300 / vp0.width });
    const c = mk(Math.round(vp.width), Math.round(vp.height));
    const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: cx, viewport: vp }).promise;
    out.push(c);
  }
  return out;
}
async function bitmap(blob) {
  try { return await createImageBitmap(blob); }
  catch { const url = URL.createObjectURL(blob); try { return await loadImg(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); } }
}
async function setManga(files) {
  files = [...files];
  if (!files.length) return;
  try {
    setStatus("Reading manga…");
    let pages;
    const pdf = files.find((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (pdf) pages = await pagesFromPdf(pdf);
    else {
      const imgs = files.filter((f) => f.type.startsWith("image/"))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (!imgs.length) throw new Error("Choose a PDF or image files of the pages.");
      pages = [];
      for (const f of imgs) pages.push(await bitmap(f));
    }
    if (!pages.length) throw new Error("That file has no pages.");
    S.pages = pages;
    $("infoManga").textContent = `${pdf ? pdf.name : files.length + " images"} · ${pages.length} page${pages.length > 1 ? "s" : ""}`;
    thumbFrom(pages[0], $("thumbManga"));
    setStatus("");
    rebuild();
  } catch (e) { setStatus(e.message || "Could not read that file. Try a PDF exported from Mangaka.", true); }
}
async function setPhotos(files) {
  const imgs = [...files].filter((f) => f.type.startsWith("image/"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!files.length) return;
  try {
    if (!imgs.length) throw new Error("Input photos must be images (JPG, PNG, WebP).");
    const use = imgs.slice(0, 4);
    const photos = [];
    for (const f of use) photos.push(await bitmap(f));
    S.photos = photos;
    $("infoPhoto").textContent = use.length === 1 ? use[0].name : `${use.length} photos`;
    thumbFrom(photos[0], $("thumbPhoto"));
    rebuild();
    setStatus(imgs.length > 4 ? "Using the first 4 photos." : "");
  } catch (e) { setStatus(e.message || "Could not read that image.", true); }
}
function thumbFrom(src, img) {
  const c = mk(104, 128); drawCover(c.getContext("2d"), src, 0, 0, 104, 128, 0.5, 0.1);
  img.src = c.toDataURL("image/jpeg", 0.8);
}

/* ---------- export ---------- */
function setStatus(msg, err) { const s = $("status"); s.textContent = msg; s.classList.toggle("err", !!err); }
function setBar(p) { $("bar").style.width = (clamp(p, 0, 1) * 100).toFixed(1) + "%"; }
async function pickCodec(W, H, fps) {
  if (!("VideoEncoder" in window)) return null;
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.640032", "avc1.42e028"]) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 12e6, framerate: fps });
      if (s.supported) return codec;
    } catch {}
  }
  return null;
}
async function encodeVideo(W, H, dur, fps, drawFn, onP) {
  const c = mk(W, H), ctx = c.getContext("2d");
  const n = Math.round(dur * fps);
  const codec = await pickCodec(W, H, fps);
  const Mp4Muxer = codec ? await vendorImport(MP4_MUXER).catch(() => null) : null;
  if (codec && Mp4Muxer) {
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: W, height: H }, fastStart: "in-memory" });
    let fail = null;
    const enc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: (e) => { fail = e; } });
    enc.configure({ codec, width: W, height: H, bitrate: W * H > 2e6 ? 14e6 : 11e6, framerate: fps });
    for (let i = 0; i < n; i++) {
      if (fail) throw fail;
      drawFn(ctx, i / fps);
      const vf = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (i % 10 === 0) { onP(i / n); await new Promise((r) => setTimeout(r, 0)); }
    }
    await enc.flush(); enc.close();
    if (fail) throw fail;
    muxer.finalize();
    return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), ext: "mp4" };
  }
  // Fallback: record the canvas in real time (WebM)
  if (!c.captureStream || !window.MediaRecorder) throw new Error("This browser can't export video. Try Chrome, Edge or Safari 17+.");
  const stream = c.captureStream(fps);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start();
  const start = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      drawFn(ctx, Math.min(t, dur)); onP(t / dur);
      if (t >= dur) return res();
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop(); await done;
  return { blob: new Blob(chunks, { type: "video/webm" }), ext: "webm" };
}
const toPng = (c) => new Promise((r) => c.toBlob(r, "image/png"));
function saveFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "Downloaded " + filename + ".";
}
/* Minimal ZIP writer (stored, no compression): MP4 and PNG are already compressed. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function makeZip(entries) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const { name, blob } of entries) {
    const data = new Uint8Array(await blob.arrayBuffer()), nm = enc.encode(name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nm.length, true);
    parts.push(lh, nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
    central.push(ch, nm);
    offset += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
async function doExport() {
  if (!ready() || S.busy) return;
  S.busy = true; $("export").disabled = true; setBar(0);
  try {
    if (S.fmt === "reels") {
      const tm = reelTiming();
      setStatus("Rendering the Reel…");
      const v = await encodeVideo(RW, RH, tm.dur, S.fps, reelFrame, (p) => { setBar(p); setStatus(`Rendering the Reel… ${Math.round(p * 100)}%`); });
      setBar(1);
      setStatus(saveFile(`mangaka-reel.${v.ext}`, v.blob));
    } else {
      const tm = carTiming();
      const total = 1 + spreads.length;
      // weight progress by duration so the bar moves evenly
      const durs = [tm.dur, ...spreads.map(() => SPREAD_DUR)], sum = durs.reduce((a, b) => a + b, 0);
      let doneDur = 0;
      const zip = [];
      for (let k = 0; k < total; k++) {
        const name = String(k + 1).padStart(2, "0");
        const fn = k === 0 ? carVideoFrame : (ctx, t) => spreadFrame(ctx, k - 1, t);
        const v = await encodeVideo(CW, CH, durs[k], S.fps, fn, (p) => {
          setBar((doneDur + p * durs[k]) / sum * 0.97);
          setStatus(`Rendering slide ${k + 1} of ${total}… ${Math.round(p * 100)}%`);
        });
        zip.push({ name: `${name}.${v.ext}`, blob: v.blob });
        const still = mk(CW, CH); fn(still.getContext("2d"), k === 0 ? 0 : BREATH / 4);
        zip.push({ name: `stills/${name}.png`, blob: await toPng(still) });
        doneDur += durs[k];
      }
      setStatus("Adding the closing video…");
      const closing = await fetch(CLOSING_SRC);
      if (!closing.ok) throw new Error("Could not load the closing video. Check your connection and export again.");
      zip.push({ name: `${String(total + 1).padStart(2, "0")}.mp4`, blob: await closing.blob() });
      setStatus("Packing slides…");
      const blob = await makeZip(zip);
      setBar(1);
      setStatus(saveFile("mangaka-carousel.zip", blob));
    }
  } catch (e) {
    setStatus((e && e.message) || "Export failed. Try again.", true);
  } finally {
    S.busy = false; $("export").disabled = false;
  }
}

/* ---------- wiring ---------- */
function setFmt(f) {
  S.fmt = f;
  $("fmtReels").setAttribute("aria-pressed", String(f === "reels"));
  $("fmtCar").setAttribute("aria-pressed", String(f === "car"));
  $("carOpts").hidden = f !== "car";
  $("speed").value = S.speed[f];
  $("export").textContent = f === "reels" ? "Export Reel (MP4)" : "Export carousel (ZIP)";
  S.slide = 0; rebuild();
}
function wireDrop(zone, input, handler) {
  input.addEventListener("change", () => handler(input.files));
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("over"); handler(e.dataTransfer.files); });
}
wireDrop($("dropManga"), $("fileManga"), (fs) => setManga(fs));
wireDrop($("dropPhoto"), $("filePhoto"), (fs) => setPhotos(fs));
$("fmtReels").onclick = () => setFmt("reels");
$("fmtCar").onclick = () => setFmt("car");
$("speed").addEventListener("input", () => { S.speed[S.fmt] = +$("speed").value; S.t0 = performance.now(); updateMeta(); });
$("vidPages").addEventListener("input", () => { S.vidPages = +$("vidPages").value; rebuild(); });
let promptTimer = 0;
$("prompt").addEventListener("input", () => { clearTimeout(promptTimer); promptTimer = setTimeout(() => { reelCache = null; draw(true); }, 150); });
$("play").onclick = () => { S.playing = !S.playing; $("play").textContent = S.playing ? "Pause" : "Play"; S.t0 = performance.now(); draw(true); };
$("export").onclick = doExport;

let started = false;
export async function init() {
  if (started) return;
  started = true;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { S.playing = false; $("play").textContent = "Play"; }
  try {
    await Promise.all(["900 64px Inter", "600 30px Inter", "800 76px 'Bricolage Grotesque'", "600 44px Manrope"].map((f) => document.fonts.load(f)));
  } catch {}
  [S.logo, S.wm] = await Promise.all([loadImg(LOGO_SRC), loadImg(WMSTACK_SRC)]);
  setFmt("reels");
  requestAnimationFrame(loop);
}
