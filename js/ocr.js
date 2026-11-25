// Reads text from screenshots and cuts out the photo part, all inside the browser.
// Tesseract (the text reader) downloads its code + English data from a CDN the first
// time; your images are never sent anywhere.
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let workerP;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load text reader (offline?)'));
    document.head.appendChild(s);
  });
}

async function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      await loadScript(TESS_URL);
      return window.Tesseract.createWorker('eng');
    })();
    workerP.catch(() => { workerP = null; });
  }
  return workerP;
}

export async function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

// Returns { text, words:[{bbox,confidence}] }
export async function readText(blob) {
  const worker = await getWorker();
  // Small text (e.g. low-res chat screenshots) reads much better scaled up
  const img = await loadImage(blob);
  let src = blob, scale = 1;
  if (img.naturalWidth < 1000) {
    scale = Math.min(3, 1000 / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.min(30000, Math.round(img.naturalHeight * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height * 1);
    src = await new Promise(res => c.toBlob(res, 'image/png'));
  }
  const { data } = await worker.recognize(src, {}, { text: true, blocks: true });
  const words = [], lines = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const ws = l.words || [];
    for (const w of ws) {
      const bb = w.bbox;
      words.push({ bbox: { x0: bb.x0 / scale, y0: bb.y0 / scale, x1: bb.x1 / scale, y1: bb.y1 / scale }, confidence: w.confidence, text: w.text });
    }
    // drop lines that are mostly noise (OCR "reading" a photo)
    const conf = ws.length ? ws.reduce((s, w) => s + w.confidence, 0) / ws.length : 0;
    if (conf >= 60) lines.push(l.text.trim());
  }
  return { text: lines.join('\n'), words };
}

// Finds the tallest strip of the screenshot with no readable text and a lot of
// colour variation — on dating-app screenshots that's the guy's photo.
export async function findPhoto(blob, words) {
  const img = await loadImage(blob);
  const W = img.naturalWidth, H = img.naturalHeight;
  if (H > W * 2.5) return null; // long chat scroll, not a profile pic
  const rows = 100, rowH = H / rows;
  const textRow = new Array(rows).fill(false);
  for (const w of words) {
    if (w.confidence < 55 || !w.text || w.text.replace(/\W/g, '').length < 2) continue;
    const a = Math.floor(w.bbox.y0 / rowH), b = Math.floor(w.bbox.y1 / rowH);
    for (let i = Math.max(0, a); i <= Math.min(rows - 1, b); i++) textRow[i] = true;
  }
  // colour variance per row, sampled small
  const c = document.createElement('canvas');
  const sw = 60, sh = rows;
  c.width = sw; c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  const px = ctx.getImageData(0, 0, sw, sh).data;
  const busy = [];
  for (let y = 0; y < sh; y++) {
    let sum = 0, sum2 = 0;
    for (let x = 0; x < sw; x++) { const i = (y * sw + x) * 4; const v = (px[i] + px[i + 1] + px[i + 2]) / 3; sum += v; sum2 += v * v; }
    const mean = sum / sw; busy.push(Math.sqrt(Math.max(0, sum2 / sw - mean * mean)));
  }
  // Allow a few text rows inside the photo (name overlays), skip status bar
  let best = null, start = -1, gaps = 0;
  for (let y = 3; y <= rows; y++) {
    const ok = y < rows && (busy[y] > 18 || (!textRow[y] && busy[y] > 8));
    const textHere = y < rows && textRow[y];
    if (ok && (!textHere || gaps < 6)) { if (start < 0) start = y; if (textHere) gaps++; }
    else {
      if (start >= 0) { const len = y - start; if (!best || len > best.len) best = { start, len }; }
      start = -1; gaps = 0;
    }
  }
  if (!best || best.len < 18) return null; // no clear photo
  const y0 = Math.round(best.start * rowH), h = Math.round(best.len * rowH);
  const out = document.createElement('canvas');
  const scale = Math.min(1, 900 / W);
  out.width = Math.round(W * scale); out.height = Math.round(h * scale);
  out.getContext('2d').drawImage(img, 0, y0, W, h, 0, 0, out.width, out.height);
  return new Promise(res => out.toBlob(res, 'image/jpeg', 0.85));
}

// Shrinks big screenshots so storage doesn't fill up.
// Long scrolling chat screenshots are only limited by width so the text stays readable.
export async function shrink(blob, max = 1400) {
  const img = await loadImage(blob);
  const tall = img.naturalHeight > img.naturalWidth * 2.5;
  const s = tall ? Math.min(1, max / img.naturalWidth, 16000 / img.naturalHeight) : Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (s === 1 && blob.size < 900000) return blob;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
}

// Start loading the text reader early so the first read is quicker.
export function warmUp() { getWorker().catch(() => {}); }
