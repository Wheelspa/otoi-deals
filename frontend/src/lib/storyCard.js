import { API, inr } from "@/lib/api";

const W = 1080, H = 1920, ORANGE = "#B0CB1F";
const DISPLAY = '"Bricolage Grotesque", sans-serif';
const MONO = '"JetBrains Mono", monospace';
const BRAND = '"Rubik", sans-serif';
const NAVY = "#141B26";

const loadImage = (src) => new Promise((res) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => res(img);
  img.onerror = () => res(null);
  img.src = src;
});

const coverDraw = (ctx, img, x, y, w, h) => {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
};

const wrap = (ctx, text, maxW, maxLines) => {
  const words = text.split(" "), lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += "…"; }
  return lines;
};

const pill = (ctx, x, y, text, fg, bg, font) => {
  ctx.font = font;
  const w = ctx.measureText(text).width + 56;
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(x, y, w, 72, 36); ctx.fill();
  ctx.fillStyle = fg; ctx.textBaseline = "middle"; ctx.fillText(text, x + 28, y + 38);
  ctx.textBaseline = "alphabetic";
  return w;
};

export const fmtDuration = (sec) => {
  sec = Math.max(1, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (h < 1) return sec % 60 ? `${m}m ${sec % 60}s` : `${m}m`;
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${d}d ${h % 24}h`;
};

const drawSoldOut = (ctx, deal, startY) => {
  let y = startY + 190;
  ctx.fillStyle = "#fff"; ctx.font = `800 200px ${DISPLAY}`;
  ctx.fillText("SOLD OUT", 60, y);
  y += 130;
  ctx.fillStyle = ORANGE; ctx.font = `800 110px ${MONO}`;
  ctx.fillText(deal.sold_in_seconds ? `IN ${fmtDuration(deal.sold_in_seconds).toUpperCase()}` : "ALL GONE", 66, y);
  y += 100;
  ctx.font = `500 40px ${MONO}`; ctx.fillStyle = "#a1a1aa";
  ctx.fillText(`${deal.total_qty} unit${deal.total_qty === 1 ? "" : "s"} · ${deal.discount_percent}% off · never coming back`, 72, y);
};

export async function renderStory(deal) {
  await Promise.all([`800 80px ${DISPLAY}`, `800 80px ${MONO}`, `500 30px ${MONO}`, `700 76px ${BRAND}`, `500 26px ${BRAND}`].map((f) => document.fonts.load(f)));
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#141B26"; ctx.fillRect(0, 0, W, H);

  const img = await loadImage(`${API}/share/deal-image?pid=${deal.id}`);
  const soldOut = deal.display_status === "SOLD_OUT";
  if (img) {
    if (soldOut) ctx.filter = "grayscale(1) brightness(0.75)";
    coverDraw(ctx, img, 0, 0, W, 1000);
    ctx.filter = "none";
  }
  const g = ctx.createLinearGradient(0, 420, 0, 1000);
  g.addColorStop(0, "rgba(9,9,11,0)"); g.addColorStop(1, "rgba(9,9,11,1)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 1000);
  const top = ctx.createLinearGradient(0, 0, 0, 260);
  top.addColorStop(0, "rgba(9,9,11,0.85)"); top.addColorStop(1, "rgba(9,9,11,0)");
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 260);

  ctx.fillStyle = "#fff"; ctx.font = `700 76px ${BRAND}`; ctx.fillText("dealwills", 72, 140);
  const ow = ctx.measureText("dealwills").width;
  ctx.fillStyle = ORANGE;
  [0, 34].forEach((dx) => { const x = 84 + ow + dx; ctx.beginPath(); ctx.moveTo(x, 88); ctx.lineTo(x + 18, 88); ctx.lineTo(x + 42, 112); ctx.lineTo(x + 18, 136); ctx.lineTo(x, 136); ctx.lineTo(x + 24, 112); ctx.closePath(); ctx.fill(); });
  ctx.font = `500 26px ${BRAND}`; ctx.fillStyle = "#a1a1aa"; ctx.textAlign = "right";
  ctx.fillText("Timely delivery always", W - 72, 128); ctx.textAlign = "left";

  pill(ctx, 72, 770, `● ${deal.display_status.replace(/_/g, " ")}`, NAVY, ORANGE, `800 30px ${MONO}`);

  ctx.fillStyle = "#fff"; ctx.font = `800 84px ${DISPLAY}`;
  const lines = wrap(ctx, deal.name, W - 144, 3);
  let y = 950;
  lines.forEach((l) => { ctx.fillText(l, 72, y); y += 92; });

  if (soldOut) {
    drawSoldOut(ctx, deal, y);
  } else {
  y += 150;
  ctx.fillStyle = ORANGE; ctx.font = `800 190px ${MONO}`;
  const price = inr(deal.current_price);
  ctx.fillText(price, 60, y);
  y += 90;
  ctx.font = `500 54px ${MONO}`; ctx.fillStyle = "#71717a";
  const orig = inr(deal.original_price), owid = ctx.measureText(orig).width;
  ctx.fillText(orig, 72, y);
  ctx.strokeStyle = "#71717a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(68, y - 18); ctx.lineTo(76 + owid, y - 18); ctx.stroke();
  pill(ctx, 112 + owid, y - 54, `${deal.discount_percent}% OFF`, ORANGE, "rgba(176,203,31,0.16)", `800 38px ${MONO}`);

  y += 90;
  const pct = Math.min(100, deal.percent_sold);
  ctx.fillStyle = "#243042"; ctx.beginPath(); ctx.roundRect(72, y, W - 144, 40, 20); ctx.fill();
  if (pct > 0) {
    const bar = ctx.createLinearGradient(72, 0, W - 72, 0);
    bar.addColorStop(0, "#fbbf24"); bar.addColorStop(0.5, ORANGE); bar.addColorStop(1, "#ef4444");
    ctx.fillStyle = bar; ctx.beginPath(); ctx.roundRect(72, y, Math.max(40, (W - 144) * pct / 100), 40, 20); ctx.fill();
  }
  y += 110;
  ctx.font = `800 72px ${MONO}`; ctx.fillStyle = "#fff"; ctx.fillText(String(deal.remaining), 72, y);
  const rw = ctx.measureText(String(deal.remaining)).width;
  ctx.font = `500 32px ${MONO}`; ctx.fillStyle = "#a1a1aa";
  ctx.fillText(`UNITS LEFT OF ${deal.total_qty}`, 96 + rw, y - 6);
  ctx.textAlign = "right"; ctx.fillStyle = ORANGE; ctx.fillText(`${pct % 1 === 0 ? pct : pct.toFixed(1)}% SOLD`, W - 72, y - 6);
  ctx.textAlign = "left";
  }

  ctx.fillStyle = ORANGE; ctx.beginPath(); ctx.roundRect(72, H - 190, W - 144, 110, 55); ctx.fill();
  ctx.fillStyle = NAVY; ctx.font = `800 44px ${DISPLAY}`; ctx.textAlign = "center";
  ctx.fillText(soldOut ? "NEXT DROP SOON — TURN ON ALERTS" : "GRAB IT BEFORE IT'S GONE", W / 2, H - 120);
  ctx.font = `500 28px ${MONO}`; ctx.fillStyle = "#71717a";
  ctx.fillText(window.location.host.toUpperCase(), W / 2, H - 30);
  ctx.textAlign = "left";

  return new Promise((res) => canvas.toBlob(res, "image/png"));
}
