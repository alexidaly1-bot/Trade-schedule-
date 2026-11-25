import { db, uid, exportAll, importAll } from './db.js';
import { parseProfile, mergeProfile } from './parser.js';
import { readText, findPhoto, shrink, warmUp as warmOcr } from './ocr.js';

// ---------- state ----------
const S = { trades: [], appts: [], view: 'schedule', start: null, days: 7, addFor: null, pending: [] };
const urls = new Map(); // image id -> object URL
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SNAP = 15; // minutes
const DEFAULT_LEN = 90;
const HOURPX = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 52;

const FIELDS = [
  ['name', 'Name'], ['age', 'Age'], ['location', 'Suburb / area'], ['distance', 'Distance'],
  ['height', 'Height'], ['weight', 'Weight'], ['body', 'Body'], ['position', 'Position'],
  ['ethnicity', 'Ethnicity'], ['status', 'HIV status'], ['tested', 'Last tested'], ['hosting', 'Hosting'],
  ['phone', 'Phone'], ['handle', 'Handle / socials'], ['app', 'Met on'], ['address', 'Address'],
];
const LISTS = [['tribes', 'Tribes'], ['lookingFor', 'Looking for']];

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600);
}
const fmtTime = (d) => d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
const fmtDay = (d) => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toLocalInput = (d) => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 16); };
const trade = (id) => S.trades.find(t => t.id === id);

async function imgURL(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  const rec = await db.get('images', id);
  if (!rec) return null;
  const u = URL.createObjectURL(rec.blob); urls.set(id, u); return u;
}
function photoEl(t, cls = '') {
  const initial = esc((t?.name || '?').trim()[0] || '?').toUpperCase();
  const id = t?.cartoonId || t?.mainPhotoId;
  if (!id) return `<span class="ph none ${cls}">${initial}</span>`;
  return `<span class="ph ${cls}" data-img="${id}"></span>`;
}
async function hydrate(root = document) {
  for (const el of $$('[data-img]', root)) {
    const u = await imgURL(el.dataset.img);
    if (u) { if (el.tagName === 'IMG') el.src = u; else el.style.backgroundImage = `url("${u}")`; }
  }
}
function nextAppt(tid) {
  const now = Date.now();
  return S.appts.filter(a => a.tradeId === tid && a.status !== 'cancelled' && new Date(a.end) > now).sort((a, b) => new Date(a.start) - new Date(b.start))[0];
}

// ---------- load ----------
async function load() {
  [S.trades, S.appts] = await Promise.all([db.all('trades'), db.all('appts')]);
}

// ---------- views ----------
function show(view) {
  S.view = view;
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + view));
  if (view === 'schedule') renderSchedule();
  if (view === 'trades') renderTrades();
  if (view === 'add') { renderAdd(); warmOcr(); }
}

// ---------- schedule ----------
function setRange() {
  S.days = window.innerWidth < 700 ? 3 : 7;
  if (!S.start) {
    const t = startOfDay(new Date());
    S.start = S.days === 7 ? addDays(t, -((t.getDay() + 6) % 7)) : t;
  }
}
function renderSchedule() {
  setRange();
  const days = [...Array(S.days)].map((_, i) => addDays(S.start, i));
  const today = new Date();
  const end = addDays(S.start, S.days - 1);
  $('#rangeLabel').textContent = days[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' – ' + end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  const cols = `44px repeat(${S.days}, minmax(0, 1fr))`;
  const head = $('#calHead'); head.style.gridTemplateColumns = cols;
  head.innerHTML = '<div></div>' + days.map(d => `<div class="${sameDay(d, today) ? 'today' : ''}">${d.toLocaleDateString('en-AU', { weekday: 'short' })}<b>${d.getDate()}</b></div>`).join('');

  const body = $('#calBody'); body.style.gridTemplateColumns = cols;
  const hours = [...Array(24)].map((_, h) => `<div>${h === 0 ? '' : (h % 12 || 12) + (h < 12 ? 'am' : 'pm')}</div>`).join('');
  const slots = [...Array(24)].map(() => '<div class="slot"></div>').join('');
  body.innerHTML = `<div class="gutter">${hours}</div>` + days.map((d, i) => `<div class="day-col ${sameDay(d, today) ? 'today' : ''}" data-day="${d.toISOString()}">${slots}</div>`).join('');

  const px = HOURPX() / 60;
  const cols$ = $$('.day-col', body);
  days.forEach((d, i) => {
    const dayAppts = S.appts.filter(a => sameDay(new Date(a.start), d)).sort((a, b) => new Date(a.start) - new Date(b.start));
    // side-by-side lanes when appointments overlap
    const lanes = [];
    dayAppts.forEach(a => {
      const s = new Date(a.start);
      let lane = lanes.findIndex(endT => endT <= s);
      if (lane < 0) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = new Date(a.end); a._lane = lane;
    });
    const n = Math.max(1, lanes.length);
    for (const a of dayAppts) {
      const t = trade(a.tradeId);
      const s = new Date(a.start), e = new Date(a.end);
      const top = (s.getHours() * 60 + s.getMinutes()) * px;
      const h = Math.max(22, (e - s) / 60000 * px);
      const el = document.createElement('div');
      el.className = 'appt ' + (a.status || '');
      el.dataset.drag = 'appt'; el.dataset.id = a.id;
      el.style.top = top + 'px'; el.style.height = h + 'px';
      el.style.left = `calc(${(a._lane / n) * 100}% + 2px)`; el.style.width = `calc(${100 / n}% - 4px)`; el.style.right = 'auto';
      el.innerHTML = `${photoEl(t)}<div><b>${esc(t?.name || 'Unknown')}</b><span class="t">${fmtTime(s)}–${fmtTime(e)}${a.place ? ' · ' + esc(a.place) : ''}</span></div><div class="rz" data-resize="${a.id}"></div>`;
      cols$[i].appendChild(el);
    }
    if (sameDay(d, today)) {
      const nl = document.createElement('div'); nl.className = 'now-line';
      nl.style.top = (today.getHours() * 60 + today.getMinutes()) * px + 'px';
      cols$[i].appendChild(nl);
    }
  });
  renderTray();
  hydrate($('#view-schedule'));
  if (!renderSchedule.scrolled) { $('#calScroll').scrollTop = HOURPX() * 16.5; renderSchedule.scrolled = true; }
}
function renderTray() {
  const all = $('#trayAll').checked;
  const list = S.trades.filter(t => all || !nextAppt(t.id)).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  $('#trayList').innerHTML = list.length ? list.map(t => `<div class="chip" data-drag="trade" data-id="${t.id}">${photoEl(t)}<span>${esc(t.name || 'Unnamed')}<small>${esc([t.age, t.location || t.distance].filter(Boolean).join(' · '))}</small></span></div>`).join('')
    : `<p class="small">${S.trades.length ? 'Everyone’s booked 🎉' : 'No guys yet — tap “+ Add”.'}</p>`;
}

// ---------- drag & drop (mouse + touch) ----------
let drag = null;
function minutesAt(col, clientY, offsetMin = 0) {
  const r = col.getBoundingClientRect();
  let m = (clientY - r.top) / (HOURPX() / 60) - offsetMin;
  m = Math.round(m / SNAP) * SNAP;
  return Math.max(0, Math.min(24 * 60 - SNAP, m));
}
function dateAt(col, mins) { const d = new Date(col.dataset.day); d.setHours(0, mins, 0, 0); return d; }

document.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  const rz = e.target.closest('[data-resize]');
  const src = rz ? rz.closest('[data-drag]') : e.target.closest('[data-drag]');
  if (!src) return;
  const a = src.dataset.drag === 'appt' ? S.appts.find(x => x.id === src.dataset.id) : null;
  let offsetMin = 0;
  if (a && !rz) offsetMin = Math.round((e.clientY - src.getBoundingClientRect().top) / (HOURPX() / 60));
  drag = { src, kind: rz ? 'resize' : src.dataset.drag, id: src.dataset.id, appt: a, x: e.clientX, y: e.clientY, started: false, offsetMin, pointerType: e.pointerType };
  if (e.pointerType !== 'mouse' && !rz) {
    drag.timer = setTimeout(() => { if (drag && !drag.started) beginDrag(e.clientX, e.clientY); }, 280);
  }
  if (rz) { e.preventDefault(); beginDrag(e.clientX, e.clientY); }
});
function beginDrag(x, y) {
  drag.started = true;
  document.body.classList.add('dragging');
  if (navigator.vibrate) navigator.vibrate(15);
  if (drag.kind !== 'resize') {
    const g = drag.src.cloneNode(true);
    g.className = (drag.src.className + ' ghost').replace('lifted', '');
    g.style.cssText = 'height:auto;top:0;left:0;width:160px';
    document.body.appendChild(g); drag.ghost = g;
    drag.src.classList.add('lifted');
    hydrate(g);
  }
  moveDrag(x, y);
}
function moveDrag(x, y) {
  drag.lastX = x; drag.lastY = y;
  if (drag.ghost) { drag.ghost.style.transform = `translate(${x - 30}px, ${y - 20}px) rotate(-2deg)`; }
  $$('.drop-preview').forEach(p => p.remove());
  $('#tray').classList.remove('drop-on');
  drag.target = null;

  if (drag.kind === 'resize') {
    const col = drag.src.closest('.day-col');
    const s = new Date(drag.appt.start);
    const startM = s.getHours() * 60 + s.getMinutes();
    let endM = Math.max(startM + SNAP, minutesAt(col, y) + 0);
    endM = Math.min(endM, 24 * 60);
    drag.target = { endM };
    drag.src.style.height = (endM - startM) * HOURPX() / 60 + 'px';
    const tEl = $('.t', drag.src);
    if (tEl) tEl.textContent = fmtTime(s) + '–' + fmtTime(dateAt(col, endM));
  } else {
    const under = document.elementFromPoint(x, y);
    const col = under && under.closest('.day-col');
    if (col) {
      const len = drag.appt ? (new Date(drag.appt.end) - new Date(drag.appt.start)) / 60000 : DEFAULT_LEN;
      const m = minutesAt(col, y, drag.offsetMin);
      const p = document.createElement('div'); p.className = 'drop-preview';
      p.style.top = m * HOURPX() / 60 + 'px'; p.style.height = Math.min(len, 24 * 60 - m) * HOURPX() / 60 + 'px';
      p.textContent = fmtTime(dateAt(col, m));
      col.appendChild(p);
      drag.target = { col, m, len };
    } else if (under && under.closest('#tray') && drag.kind === 'appt') {
      $('#tray').classList.add('drop-on'); drag.target = { tray: true };
    }
  }
  // auto-scroll the calendar near its edges
  const sc = $('#calScroll'), r = sc.getBoundingClientRect();
  cancelAnimationFrame(drag.raf);
  const edge = 50;
  const dir = y < r.top + edge && y > r.top - 20 ? -1 : (y > r.bottom - edge && y < r.bottom + 40 ? 1 : 0);
  if (dir) {
    const step = () => { if (!drag || !drag.started) return; sc.scrollTop += dir * 10; moveDrag(drag.lastX, drag.lastY); };
    drag.raf = requestAnimationFrame(step);
  }
}
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.started) {
    const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (drag.pointerType === 'mouse' && moved > 5) beginDrag(e.clientX, e.clientY);
    else if (drag.pointerType !== 'mouse' && moved > 10) { clearTimeout(drag.timer); drag = null; } // it's a scroll
    return;
  }
  e.preventDefault();
  moveDrag(e.clientX, e.clientY);
}, { passive: false });
// stop the page scrolling under a finger that's dragging
document.addEventListener('touchmove', (e) => { if (drag && drag.started) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });

async function endDrag(e, cancelled) {
  if (!drag) return;
  const d = drag; drag = null;
  clearTimeout(d.timer); cancelAnimationFrame(d.raf);
  document.body.classList.remove('dragging');
  d.ghost && d.ghost.remove();
  d.src.classList.remove('lifted');
  $$('.drop-preview').forEach(p => p.remove());
  $('#tray').classList.remove('drop-on');

  if (!d.started) return; // a plain tap is handled by the click listener
  lastDragEnd = Date.now();
  const tg = d.target;
  if (cancelled || !tg) return renderSchedule();
  if (d.kind === 'resize') {
    const s = new Date(d.appt.start); const end = new Date(s); end.setHours(0, tg.endM, 0, 0);
    d.appt.end = end.toISOString(); await db.put('appts', d.appt);
  } else if (tg.tray) {
    await db.del('appts', d.appt.id); S.appts = S.appts.filter(a => a.id !== d.appt.id);
    toast('Unbooked — he’s back in “To book”');
  } else {
    const start = dateAt(tg.col, tg.m); const end = new Date(+start + tg.len * 60000);
    if (d.kind === 'appt') { Object.assign(d.appt, { start: start.toISOString(), end: end.toISOString() }); await db.put('appts', d.appt); toast('Moved to ' + fmtDay(start) + ' ' + fmtTime(start)); }
    else {
      const a = { id: uid(), tradeId: d.id, start: start.toISOString(), end: end.toISOString(), status: 'planned', place: defaultPlace(trade(d.id)), notes: '' };
      S.appts.push(a); await db.put('appts', a);
      toast('Booked ' + (trade(d.id)?.name || '') + ' · ' + fmtDay(start) + ' ' + fmtTime(start));
    }
  }
  renderSchedule();
}
document.addEventListener('pointerup', (e) => endDrag(e, false));
document.addEventListener('pointercancel', (e) => endDrag(e, !drag?.started));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag) endDrag(e, true); });

let lastDragEnd = 0;
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-drag]');
  if (!el || Date.now() - lastDragEnd < 400 || e.target.closest('[data-resize]')) return;
  if (el.dataset.drag === 'appt') openAppt(el.dataset.id); else openTrade(el.dataset.id);
});
const defaultPlace = (t) => t?.hosting === 'Can host' ? 'His place' : (t?.hosting === "Can't host" ? 'Mine' : '');

// tap an empty slot to book someone there
$('#calBody').addEventListener('click', (e) => {
  const col = e.target.closest('.day-col');
  if (!col || e.target.closest('.appt') || Date.now() - lastDragEnd < 400) return;
  const m = Math.floor(minutesAt(col, e.clientY) / 30) * 30;
  quickBook(dateAt(col, m));
});
function quickBook(start) {
  if (!S.trades.length) { toast('Add a guy first'); return show('add'); }
  const opts = [...S.trades].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(t => `<option value="${t.id}">${esc(t.name || 'Unnamed')}</option>`).join('');
  modal(`<div class="modal-head"><h2>Book ${fmtDay(start)} ${fmtTime(start)}</h2><button class="icon" data-close>✕</button></div>
    <div class="form"><label class="full">Who<select id="qbWho">${opts}</select></label>
    <label>Start<input id="qbStart" type="datetime-local" step="900" value="${toLocalInput(start)}"></label>
    <label>Length (mins)<input id="qbLen" type="number" step="15" value="${DEFAULT_LEN}"></label></div>
    <div class="row"><button class="primary" id="qbGo">Book</button></div>`);
  $('#qbGo').onclick = async () => {
    const s = new Date($('#qbStart').value); const t = trade($('#qbWho').value);
    const a = { id: uid(), tradeId: t.id, start: s.toISOString(), end: new Date(+s + (+$('#qbLen').value || DEFAULT_LEN) * 60000).toISOString(), status: 'planned', place: defaultPlace(t), notes: '' };
    S.appts.push(a); await db.put('appts', a); closeModal(); renderSchedule(); toast('Booked ' + (t.name || ''));
  };
}

// ---------- trades grid ----------
function renderTrades() {
  const q = $('#search').value.trim().toLowerCase();
  const list = S.trades.filter(t => !q || JSON.stringify(t).toLowerCase().includes(q))
    .sort((a, b) => { const na = nextAppt(a.id), nb = nextAppt(b.id); if (na && nb) return new Date(na.start) - new Date(nb.start); if (na) return -1; if (nb) return 1; return (b.updated || 0) - (a.updated || 0); });
  $('#tradeGrid').innerHTML = list.length ? list.map(t => {
    const n = nextAppt(t.id);
    return `<button class="card" data-open="${t.id}">${photoEl(t)}<div class="info"><b>${esc(t.name || 'Unnamed')}</b>
      <span class="small">${esc([t.age, t.location || t.distance, t.position].filter(Boolean).join(' · '))}</span>
      ${n ? `<div class="next">📅 ${fmtDay(new Date(n.start))} ${fmtTime(new Date(n.start))}</div>` : ''}
      ${t.rating ? `<div class="small">${'★'.repeat(t.rating)}</div>` : ''}</div></button>`;
  }).join('') : `<p class="empty">${q ? 'No match.' : 'No guys yet. Tap “+ Add” to drop in screenshots.'}</p>`;
  hydrate($('#tradeGrid'));
}
$('#tradeGrid').addEventListener('click', e => { const c = e.target.closest('[data-open]'); if (c) openTrade(c.dataset.open); });
$('#search').addEventListener('input', renderTrades);

// ---------- add / import ----------
function renderAdd() {
  const t = S.addFor && trade(S.addFor);
  $('#addTitle').textContent = t ? `Add more info to ${t.name || 'him'}` : 'Add a guy';
}
async function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const blob = await shrink(f);
    S.pending.push({ id: uid(), blob, url: URL.createObjectURL(blob) });
  }
  renderPending();
}
function renderPending() {
  $('#shotPreview').innerHTML = S.pending.map(p => `<figure><img src="${p.url}" alt=""><button class="x" data-rm="${p.id}" aria-label="Remove">✕</button></figure>`).join('');
}
$('#shotPreview').addEventListener('click', e => {
  const id = e.target.dataset.rm; if (!id) return;
  S.pending = S.pending.filter(p => p.id !== id); renderPending();
});
$('#fileIn').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
document.addEventListener('paste', e => {
  const imgs = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile());
  if (imgs.length) { e.preventDefault(); if (S.view !== 'add') show('add'); addFiles(imgs); toast('Screenshot pasted'); }
});
$('#clearAddBtn').onclick = clearAdd;
function clearAdd() {
  S.pending.forEach(p => URL.revokeObjectURL(p.url));
  S.pending = []; S.addFor = null; $('#pasteIn').value = ''; $('#review').innerHTML = '';
  renderPending(); renderAdd();
}
function progress(frac, label) {
  const p = $('#progress'); p.hidden = frac == null; if (frac == null) return;
  $('div', p).style.width = Math.round(frac * 100) + '%'; $('span', p).textContent = label;
}

$('#readBtn').onclick = async () => {
  const pasted = $('#pasteIn').value.trim();
  if (!S.pending.length && !pasted) return toast('Add a screenshot or paste some text first');
  $('#readBtn').disabled = true;
  const result = { texts: [], photos: [], shots: [] };
  try {
    for (let i = 0; i < S.pending.length; i++) {
      const p = S.pending[i];
      progress((i + .1) / (S.pending.length + .5), `Reading screenshot ${i + 1} of ${S.pending.length}…` + (i === 0 ? ' (first time takes a bit)' : ''));
      let ocr = { text: '', words: [] };
      try { ocr = await readText(p.blob); } catch (err) { console.warn(err); toast('Couldn’t read text: ' + err.message); }
      result.texts.push(ocr.text);
      const crop = await findPhoto(p.blob, ocr.words).catch(() => null);
      result.shots.push({ id: p.id, blob: p.blob, url: p.url });
      if (crop) result.photos.push({ id: uid(), blob: crop, url: URL.createObjectURL(crop), pick: true });
    }
    progress(.95, 'Pulling out his details…');
    const allText = [pasted, ...result.texts].filter(Boolean).join('\n\n');
    // Profile fields: parse each source separately so one screenshot's junk doesn't win
    let found = {};
    for (const t of [pasted, ...result.texts]) found = mergeProfile(found, parseProfile(t));
    const when = [pasted, ...result.texts.slice().reverse()].map(t => parseProfile(t).when).find(Boolean);
    result.found = found; result.when = when; result.allText = allText;
    progress(null);
    renderReview(result);
  } finally { $('#readBtn').disabled = false; progress(null); }
};

function fieldInputs(p, foundKeys = []) {
  return FIELDS.map(([k, label]) => `<label class="${foundKeys.includes(k) ? 'found' : ''}">${label}<input name="${k}" value="${esc(p[k] || '')}"></label>`).join('')
    + LISTS.map(([k, label]) => `<label class="full ${foundKeys.includes(k) ? 'found' : ''}">${label} <span class="small">(comma separated)</span><input name="${k}" value="${esc((p[k] || []).join(', '))}"></label>`).join('');
}
function readFields(root) {
  const p = {};
  for (const [k] of FIELDS) p[k] = $(`[name="${k}"]`, root).value.trim();
  for (const [k] of LISTS) p[k] = $(`[name="${k}"]`, root).value.split(',').map(s => s.trim()).filter(Boolean);
  return p;
}

function renderReview(r) {
  const existing = S.addFor && trade(S.addFor);
  // auto-match an existing guy by name or phone
  const match = !existing && S.trades.find(t => (r.found.phone && t.phone === r.found.phone) || (r.found.name && t.name && t.name.toLowerCase() === r.found.name.toLowerCase()));
  const base = existing || {};
  const shown = mergeProfile(base, r.found);
  const foundKeys = Object.keys(r.found);
  const imgs = [...r.photos.map(p => ({ ...p, kind: 'photo' })), ...r.shots.map(s => ({ ...s, kind: 'shot', pick: !r.photos.length }))];
  if (!existing && imgs.length) imgs.find(i => i.pick) && (imgs.find(i => i.pick).main = true);
  r.imgs = imgs;

  const whenVal = r.when ? toLocalInput(r.when) : '';
  const tradeOpts = '<option value="">New guy</option>' + S.trades.map(t => `<option value="${t.id}" ${(existing?.id || match?.id) === t.id ? 'selected' : ''}>Add to: ${esc(t.name || 'Unnamed')}</option>`).join('');
  $('#review').innerHTML = `
    <div class="box"><h3>Photos</h3>
      <p class="hint">${r.photos.length ? 'I cut his photos out of the screenshots. ' : ''}Tap to keep/skip. Double-tap to make it his main pic.</p>
      <div class="thumbs" id="pickThumbs">${imgs.map((i, n) => `<figure data-n="${n}" class="${i.pick ? 'pick' : ''} ${i.main ? 'main' : ''}"><img src="${i.url}" alt=""><span class="small">${i.kind === 'photo' ? 'photo' : 'screenshot'}</span></figure>`).join('') || '<span class="small">No images.</span>'}</div>
    </div>
    <div class="box"><h3>Details ${foundKeys.length ? `<span class="small">· ${foundKeys.filter(k => k !== 'when').length} found (green)</span>` : ''}</h3>
      <div class="form" id="revForm">
        <label class="full">Save as<select id="revTarget">${tradeOpts}</select></label>
        ${fieldInputs(shown, foundKeys)}
        <label class="full">Notes<textarea name="notes" rows="3">${esc(shown.notes || '')}</textarea></label>
      </div>
    </div>
    <div class="box"><h3>Book him in? ${r.when ? '<span class="small">· time found in text</span>' : ''}</h3>
      <div class="form">
        <label class="${r.when ? 'found' : ''}">When<input id="revWhen" type="datetime-local" step="900" value="${whenVal}"></label>
        <label>Length (mins)<input id="revLen" type="number" step="15" value="${DEFAULT_LEN}"></label>
      </div>
      <p class="hint">Leave “When” empty to drag him onto the calendar later.</p>
    </div>
    <details><summary>Text I read</summary><pre class="raw">${esc(r.allText)}</pre></details>
    <div class="row"><button class="primary" id="saveTrade">Save profile</button></div>`;

  if (match) toast('Looks like ' + (match.name || 'someone') + ' you already have — set to add to him');
  const thumbs = $('#pickThumbs');
  let lastTap = 0;
  thumbs.addEventListener('click', e => {
    const f = e.target.closest('figure'); if (!f) return;
    const i = imgs[+f.dataset.n]; const now = Date.now();
    if (now - lastTap < 350) { imgs.forEach(x => x.main = false); i.main = true; i.pick = true; }
    else i.pick = !i.pick;
    lastTap = now;
    $$('figure', thumbs).forEach(fig => { const x = imgs[+fig.dataset.n]; fig.classList.toggle('pick', !!x.pick); fig.classList.toggle('main', !!x.main); });
  });
  $('#saveTrade').onclick = () => saveReview(r);
}

async function saveReview(r) {
  const root = $('#review');
  const targetId = $('#revTarget').value;
  let t = targetId ? { ...trade(targetId) } : { id: uid(), created: Date.now(), photoIds: [], shotIds: [], rawText: '' };
  const fields = readFields(root);
  Object.assign(t, fields, { notes: $('[name="notes"]', root).value, updated: Date.now() });
  t.photoIds ||= []; t.shotIds ||= [];
  for (const i of r.imgs) {
    if (!i.pick) continue;
    const id = uid();
    await db.put('images', { id, tradeId: t.id, kind: i.kind, blob: i.blob });
    (i.kind === 'photo' ? t.photoIds : t.shotIds).push(id);
    if (i.main || !t.mainPhotoId) t.mainPhotoId = id;
  }
  t.rawText = [t.rawText, r.allText].filter(Boolean).join('\n\n———\n\n');
  await db.put('trades', t);
  S.trades = S.trades.filter(x => x.id !== t.id).concat(t);

  const when = $('#revWhen').value;
  if (when) {
    const s = new Date(when);
    const a = { id: uid(), tradeId: t.id, start: s.toISOString(), end: new Date(+s + (+$('#revLen').value || DEFAULT_LEN) * 60000).toISOString(), status: 'planned', place: defaultPlace(t), notes: '' };
    S.appts.push(a); await db.put('appts', a);
    S.start = null; // jump the calendar to show it
    setRange(); S.start = S.days === 7 ? addDays(startOfDay(s), -((s.getDay() + 6) % 7)) : startOfDay(s);
  }
  clearAdd();
  toast(when ? `Saved & booked ${t.name || ''}` : `Saved ${t.name || ''} — drag him onto a time`);
  show('schedule');
}

// ---------- modal ----------
function modal(html) {
  $('#modalBody').innerHTML = html;
  const d = $('#modal'); if (!d.open) d.showModal();
  hydrate($('#modalBody'));
}
function closeModal() { $('#modal').close(); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });

// ---------- trade profile ----------
async function openTrade(id) {
  const t = trade(id); if (!t) return;
  const appts = S.appts.filter(a => a.tradeId === id).sort((a, b) => new Date(b.start) - new Date(a.start));
  const imgs = [...(t.photoIds || []).map(i => [i, 'photo']), ...(t.shotIds || []).map(i => [i, 'shot'])];
  const tags = [t.position, t.body, t.ethnicity, t.hosting, t.status, ...(t.tribes || []), ...(t.lookingFor || [])].filter(Boolean);
  modal(`<div class="modal-head"><h2>${esc(t.name || 'Unnamed')}</h2><button class="icon" data-close>✕</button></div>
    <div class="prof-top">${photoEl(t)}<div>
      <div>${esc([t.age && t.age + 'yo', t.height, t.weight, t.location || t.distance].filter(Boolean).join(' · '))}</div>
      <div class="tags">${tags.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>
      <div class="stars" id="stars">${[1, 2, 3, 4, 5].map(n => `<button data-star="${n}" class="${(t.rating || 0) >= n ? 'on' : ''}" aria-label="${n} stars">★</button>`).join('')}</div>
    </div></div>
    <div class="row"><button class="primary" id="bookBtn">📅 Book</button><button id="moreBtn">+ Add screenshots / text</button>${t.phone ? `<a href="sms:${esc(t.phone)}"><button>💬 Text</button></a>` : ''}</div>
    <div class="box"><h3>Cartoon</h3>
      ${(t.cartoonIds || []).length ? `<div class="gallery">${t.cartoonIds.map(i => `<figure><img data-img="${i}" data-zoom="${i}" alt=""><div class="acts"><button data-cartoon="${i}">${t.cartoonId === i ? '★' : '☆'}</button><button data-delcart="${i}">🗑</button></div></figure>`).join('')}</div><p class="small">★ = shown as his pic everywhere.</p>` : '<p class="small">No cartoon yet. Tap “Make cartoon”, then add the cartoon Claude sends back.</p>'}
      <div class="row"><button id="makeCartoon">🎨 Make cartoon</button><label class="filebtn">+ Add cartoon<input type="file" id="addCartoon" accept="image/*" multiple hidden></label></div>
    </div>
    ${imgs.length ? `<div class="box"><h3>Pics</h3><div class="gallery">${imgs.map(([i, k]) => `<figure><img data-img="${i}" data-zoom="${i}" alt=""><div class="acts"><button data-main="${i}">${t.mainPhotoId === i ? '★' : '☆'}</button><button data-delimg="${i}">🗑</button></div></figure>`).join('')}</div></div>` : ''}
    <div class="box"><h3>Bookings</h3>${appts.length ? `<ul class="appt-list">${appts.map(a => `<li data-appt="${a.id}"><span>${fmtDay(new Date(a.start))} ${fmtTime(new Date(a.start))}${a.place ? ' · ' + esc(a.place) : ''}</span><span class="small">${a.status}</span></li>`).join('')}</ul>` : '<p class="small">None yet.</p>'}</div>
    <div class="box"><h3>Details</h3><div class="form" id="profForm">${fieldInputs(t)}<label class="full">Notes<textarea name="notes" rows="4">${esc(t.notes || '')}</textarea></label></div>
      <div class="row"><button class="primary" id="saveProf">Save changes</button></div></div>
    ${t.rawText ? `<details><summary>All text read from his screenshots</summary><pre class="raw">${esc(t.rawText)}</pre></details>` : ''}
    <div class="row"><button class="danger" id="delTrade">Delete him</button></div>`);
  const body = $('#modalBody');
  $('#bookBtn').onclick = () => { const s = new Date(); s.setHours(20, 0, 0, 0); if (s < new Date()) s.setDate(s.getDate() + 1); quickBook(s); $('#qbWho').value = id; };
  $('#moreBtn').onclick = () => { closeModal(); clearAdd(); S.addFor = id; show('add'); };
  $('#makeCartoon').onclick = () => makeCartoon(id);
  $('#addCartoon').onchange = async e => {
    t.cartoonIds ||= [];
    for (const f of e.target.files) {
      const cid = uid(); await db.put('images', { id: cid, tradeId: id, kind: 'cartoon', blob: await shrink(f) });
      t.cartoonIds.push(cid); if (!t.cartoonId) t.cartoonId = cid;
    }
    await db.put('trades', t); refresh(); toast('Cartoon added — it’s his main pic now'); openTrade(id);
  };
  $('#stars').onclick = async e => { const n = +e.target.dataset.star; if (!n) return; t.rating = t.rating === n ? 0 : n; await db.put('trades', t); openTrade(id); };
  $('#saveProf').onclick = async () => { Object.assign(t, readFields($('#profForm')), { notes: $('[name="notes"]', body).value, updated: Date.now() }); await db.put('trades', t); toast('Saved'); openTrade(id); refresh(); };
  $('#delTrade').onclick = async () => {
    if (!confirm(`Delete ${t.name || 'him'} and all his pics and bookings?`)) return;
    for (const i of [...(t.photoIds || []), ...(t.shotIds || []), ...(t.cartoonIds || [])]) await db.del('images', i);
    for (const a of appts) await db.del('appts', a.id);
    await db.del('trades', id);
    S.trades = S.trades.filter(x => x.id !== id); S.appts = S.appts.filter(a => a.tradeId !== id);
    closeModal(); refresh(); toast('Deleted');
  };
  body.onclick = async e => {
    const el = e.target;
    if (el.dataset.cartoon) { t.cartoonId = el.dataset.cartoon; await db.put('trades', t); refresh(); return openTrade(id); }
    if (el.dataset.delcart) {
      const i = el.dataset.delcart; await db.del('images', i);
      t.cartoonIds = (t.cartoonIds || []).filter(x => x !== i);
      if (t.cartoonId === i) t.cartoonId = t.cartoonIds[0] || null;
      await db.put('trades', t); refresh(); return openTrade(id);
    }
    if (el.dataset.main) { t.mainPhotoId = el.dataset.main; await db.put('trades', t); refresh(); return openTrade(id); }
    if (el.dataset.delimg) {
      const i = el.dataset.delimg; await db.del('images', i);
      t.photoIds = (t.photoIds || []).filter(x => x !== i); t.shotIds = (t.shotIds || []).filter(x => x !== i);
      if (t.mainPhotoId === i) t.mainPhotoId = t.photoIds[0] || t.shotIds[0] || null;
      await db.put('trades', t); refresh(); return openTrade(id);
    }
    if (el.dataset.zoom) {
      const u = await imgURL(el.dataset.zoom);
      modal(`<div class="modal-head"><button id="backProf">‹ Back</button><button class="icon" data-close>✕</button></div><img class="zoom" src="${u}" alt="">`);
      $('#backProf').onclick = () => openTrade(id);
      return;
    }
    const li = el.closest('[data-appt]'); if (li) openAppt(li.dataset.appt);
  };
}

// ---------- appointment ----------
function openAppt(id) {
  const a = S.appts.find(x => x.id === id); if (!a) return;
  const t = trade(a.tradeId);
  const len = Math.round((new Date(a.end) - new Date(a.start)) / 60000);
  modal(`<div class="modal-head"><h2>${esc(t?.name || 'Booking')}</h2><button class="icon" data-close>✕</button></div>
    <div class="prof-top">${photoEl(t)}<div>${esc([t?.age, t?.location || t?.distance, t?.phone].filter(Boolean).join(' · '))}<div class="row"><button id="seeProf">See profile</button></div></div></div>
    <div class="form">
      <label>Start<input id="aStart" type="datetime-local" step="900" value="${toLocalInput(a.start)}"></label>
      <label>Length (mins)<input id="aLen" type="number" step="15" value="${len}"></label>
      <label>Where<input id="aPlace" value="${esc(a.place || '')}" placeholder="His place / mine / address"></label>
      <label>Status<select id="aStatus">${['planned', 'confirmed', 'done', 'cancelled'].map(s => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="full">Notes<textarea id="aNotes" rows="3">${esc(a.notes || '')}</textarea></label>
    </div>
    <div class="row"><button class="primary" id="aSave">Save</button><button class="danger" id="aDel">Delete booking</button></div>`);
  $('#seeProf').onclick = () => openTrade(a.tradeId);
  $('#aSave').onclick = async () => {
    const s = new Date($('#aStart').value);
    Object.assign(a, { start: s.toISOString(), end: new Date(+s + (+$('#aLen').value || DEFAULT_LEN) * 60000).toISOString(), place: $('#aPlace').value, status: $('#aStatus').value, notes: $('#aNotes').value });
    await db.put('appts', a); closeModal(); renderSchedule(); toast('Saved');
  };
  $('#aDel').onclick = async () => { await db.del('appts', id); S.appts = S.appts.filter(x => x.id !== id); closeModal(); refresh(); toast('Booking deleted'); };
}

// ---------- make cartoon ----------
// Crops his pics on the phone (above the waist only), then hands them to Claude
// with the chosen styles. Claude runs Higgsfield and sends the cartoons back.
const STYLES = ['Family Guy', 'Futurama', 'South Park', 'The Simpsons', 'Rick and Morty', 'Clean TV cartoon', 'Studio Ghibli', 'Adventure Time', "Bob's Burgers"];
function getPrefs() { try { return JSON.parse(localStorage.getItem('cartoonPrefs')) || {}; } catch { return {}; } }
function setPrefs(p) { try { localStorage.setItem('cartoonPrefs', JSON.stringify(p)); } catch {} }
function makeCartoon(id) {
  const t = trade(id);
  const pics = [...(t.photoIds || []), ...(t.shotIds || [])];
  const prefs = getPrefs();
  const chosen = prefs.styles || ['Family Guy'];
  modal(`<div class="modal-head"><h2>Cartoon ${esc(t.name || 'him')}</h2><button class="icon" data-close>✕</button></div>
    ${pics.length ? `<div class="box"><h3>1. Pics to use</h3><p class="hint">Tap to skip one. Crop them how you want before adding them.</p>
      <div class="thumbs" id="mcPics">${pics.map(i => `<figure class="pick" data-id="${i}"><img data-img="${i}" alt=""></figure>`).join('')}</div></div>`
      : '<p class="hint">Add some screenshots to him first.</p>'}
    <div class="box"><h3>2. Styles</h3><div class="form">${STYLES.map(s => `<label class="check"><input type="checkbox" value="${esc(s)}" ${chosen.includes(s) ? 'checked' : ''}>${esc(s)}</label>`).join('')}</div></div>
    <div class="box"><h3>3. Outfit</h3><input id="mcOutfit" placeholder="e.g. black tee and jeans (blank = Claude picks)" value="${esc(prefs.outfit || '')}"></div>
    <div class="row"><button class="primary" id="mcGo" ${pics.length ? '' : 'disabled'}>Send to Claude</button></div>
    <div id="mcOut"></div>`);
  $('#mcPics')?.addEventListener('click', e => { const f = e.target.closest('figure'); if (f) f.classList.toggle('pick'); });
  $('#mcGo').onclick = async () => {
    const styles = $$('#modalBody input[type=checkbox]:checked').map(c => c.value);
    if (!styles.length) return toast('Pick at least one style');
    const outfit = $('#mcOutfit').value.trim();
    setPrefs({ styles, outfit });
    const ids = $$('#mcPics figure.pick').map(f => f.dataset.id);
    if (!ids.length) return toast('Pick at least one pic');
    const btn = $('#mcGo'); btn.disabled = true;
    const files = [];
    // No analysing: send the pics exactly as you cropped them.
    for (let n = 0; n < ids.length; n++) {
      const rec = await db.get('images', ids[n]);
      if (rec) files.push(new File([rec.blob], `${(t.name || 'him').replace(/\W+/g, '-')}-${n + 1}.jpg`, { type: rec.blob.type || 'image/jpeg' }));
    }
    btn.disabled = false;
    if (!files.length) return toast('No pics found');
    const text = `Cartoon him: ${t.name || 'this guy'}. Styles: ${styles.join(', ')}. Outfit: ${outfit || 'your pick'}.`;
    const urls = files.map(f => URL.createObjectURL(f));
    $('#mcOut').innerHTML = `<div class="box"><h3>Ready: ${files.length} pic${files.length > 1 ? 's' : ''}</h3>
      <div class="thumbs">${urls.map(u => `<figure><img src="${u}" alt=""></figure>`).join('')}</div>
      <p class="hint">Check them, then send to Claude with this message:</p><pre class="raw">${esc(text)}</pre>
      <div class="row"><button class="primary" id="mcShare">Share to Claude</button><button id="mcSave">Save pics</button><button id="mcCopy">Copy message</button></div>
      <p class="small">When the cartoon comes back: his profile → “+ Add cartoon”.</p></div>`;
    $('#mcShare').onclick = async () => {
      if (navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files, text }); } catch {}
      } else toast('Sharing not supported here — use Save pics + Copy message');
    };
    $('#mcSave').onclick = () => files.forEach((f, i) => { const a = document.createElement('a'); a.href = urls[i]; a.download = f.name; a.click(); });
    $('#mcCopy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed — select the text instead'); } };
  };
}

// ---------- backup menu ----------
$('#menuBtn').onclick = () => {
  modal(`<div class="modal-head"><h2>Backup</h2><button class="icon" data-close>✕</button></div>
    <p class="hint">Everything lives only on this device/browser. Save a backup now and then, or to move to another phone.</p>
    <div class="row"><button class="primary" id="expBtn">⬇ Save backup file</button>
    <label class="pill" style="display:inline-block"><input type="file" id="impIn" accept="application/json,.json" hidden><span class="pill" style="border:1px solid var(--line);border-radius:999px;padding:8px 14px;cursor:pointer;display:inline-block">⬆ Restore backup</span></label></div>
    <p class="small">${S.trades.length} guys · ${S.appts.length} bookings</p>`);
  $('#expBtn').onclick = async () => {
    const blob = new Blob([await exportAll()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'trades-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    try { localStorage.setItem('lastBackup', String(Date.now())); } catch {}
  };
  $('#impIn').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await importAll(await f.text()); await load(); closeModal(); refresh(); toast('Backup restored'); } catch (err) { toast('That file didn’t work: ' + err.message); }
  };
};

// ---------- misc wiring ----------
function refresh() { if (S.view === 'schedule') renderSchedule(); if (S.view === 'trades') renderTrades(); }
$$('.tabs button').forEach(b => b.onclick = () => show(b.dataset.view));
$('#prevBtn').onclick = () => { S.start = addDays(S.start, -S.days); renderSchedule(); };
$('#nextBtn').onclick = () => { S.start = addDays(S.start, S.days); renderSchedule(); };
$('#todayBtn').onclick = () => { S.start = null; renderSchedule.scrolled = false; renderSchedule(); };
$('#trayAll').onchange = renderTray;
function setDiscreet(on) { document.body.classList.toggle('discreet', on); try { localStorage.setItem('discreet', on ? '1' : ''); } catch {} }
$('#discreetBtn').onclick = () => setDiscreet(!document.body.classList.contains('discreet'));
try { setDiscreet(localStorage.getItem('discreet') === '1'); } catch {}
let lastDays = 0;
window.addEventListener('resize', () => { const d = window.innerWidth < 700 ? 3 : 7; if (d !== lastDays) { lastDays = d; S.start = null; if (S.view === 'schedule') renderSchedule(); } });
setInterval(() => { if (S.view === 'schedule' && !drag) renderSchedule(); }, 60000);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

await load();
try {
  const last = +localStorage.getItem('lastBackup') || 0;
  if (S.trades.length && Date.now() - last > 7 * 864e5) setTimeout(() => toast('Tip: save a backup (⋯ top right)'), 1500);
} catch {}
lastDays = window.innerWidth < 700 ? 3 : 7;
show('schedule');
window.__app = { S, db };
