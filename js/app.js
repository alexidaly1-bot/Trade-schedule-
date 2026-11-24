import * as L from './logic.js';
import * as S from './store.js';
import { renderAvatar, OPTIONS, DEFAULT_AVATAR, STYLES, fromFeatures } from './avatar.js';
import { readImages } from './ocr.js';

// ---------- helpers ----------
const app = document.getElementById('app');
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const st = () => S.get();
const set = () => st().settings;
const fmtDay = (t) => new Date(t).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (t) => new Date(t).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
const fmtWhen = (t) => `${fmtDay(t)}, ${fmtTime(t)}`;
const toLocalInput = (t) => {
  const d = new Date(t);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const mins = (n) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`);
const person = (id) => st().people.find((p) => p.id === id);
const pname = (id) => (person(id)?.nickname || 'Someone');
const go = (h) => (location.hash = h);
const RELS = ['Ongoing', 'Partner', 'One-off'];
const CATS = ['Age', 'Demographic', 'Qualities', 'Looks', 'Interests', 'Other'];
const THEMES = ['Midnight Coral', 'Daylight', 'Ocean', 'Forest', 'High Contrast'];

function toast(msg) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/** Send discreet alert: plain words, never names or details on the lock screen. */
function alertMe(plain = 'Plans updated') {
  const discreet = set().discreetAlerts;
  const text = discreet ? 'Plans updated' : plain;
  toast(text);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then((r) => r.showNotification(text, { tag: 'bm', silent: discreet, body: '' })).catch(() => new Notification(text));
    }
  } catch {}
}

function header(title, back = '#/home') {
  return `<header class="top"><a class="back" href="${back}" aria-label="Back">‹</a><h1>${e(title)}</h1></header>`;
}
function tabs(active) {
  const t = [
    ['home', 'Home', '⌂'],
    ['roster', 'Roster', '☰'],
    ['people', 'People', '☺'],
    ['avail', 'Free times', '◷'],
    ['settings', 'Settings', '⚙'],
  ];
  return `<nav class="tabs">${t.map(([k, l, i]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}"><span>${i}</span>${l}</a>`).join('')}</nav>`;
}
function page(html, active) {
  app.innerHTML = `<main class="page">${html}</main>${active !== undefined ? tabs(active) : ''}`;
  window.scrollTo(0, 0);
}
function onlyMe(text = 'Only visible to you') {
  return `<p class="private">🔒 ${e(text)}</p>`;
}
function avatarFor(pid, size = 44) {
  const a = st().avatars.find((x) => x.person === pid);
  const p = person(pid);
  if (a) return `<span class="av" style="width:${size}px;height:${size}px">${a.svg}</span>`;
  return `<span class="av initial" style="width:${size}px;height:${size}px">${e((p?.nickname || '?')[0].toUpperCase())}</span>`;
}
function peopleOptions(selected, includeNone = true) {
  return `${includeNone ? `<option value="">No one picked yet</option>` : ''}${st()
    .people.map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${e(p.nickname)}</option>`)
    .join('')}`;
}
function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}
function bindForm(id, fn) {
  const f = document.getElementById(id);
  f?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await fn(formData(f), f, ev.submitter);
    } catch (err) {
      console.error(err);
      oops(err.message);
    }
  });
}
function oops(msg = 'Something went wrong') {
  sessionStorage.setItem('bm.err', msg);
  go('#/oops');
}
function done(msg, extra = '') {
  sessionStorage.setItem('bm.done', JSON.stringify({ msg, extra }));
  go('#/done');
}
function allItems(from = Date.now() - L.DAY, to = Date.now() + 28 * L.DAY) {
  const rout = st().routines.flatMap((r) => L.expandRoutine(r, from, to));
  return [...st().meetups, ...rout];
}
function baseURL() {
  return location.href.split('#')[0];
}
async function shareOrCopy(url, text) {
  try {
    if (navigator.share) {
      await navigator.share({ text, url });
      return true;
    }
  } catch {}
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
    return true;
  } catch {
    prompt('Copy this link', url);
    return false;
  }
}

// ---------- routes ----------
const routes = {};
const route = (name, fn) => (routes[name] = fn);

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/');
  return { name: parts[0] || 'home', arg: parts.slice(1).join('/'), q: Object.fromEntries(new URLSearchParams(query)) };
}

// Who is looking: partner / shared viewer pages never touch owner data.
const PUBLIC = new Set(['s', 'g', 'shared-done', 'shared-oops']);

let unlocked = false;
let lastHidden = 0;

async function render() {
  const { name, arg, q } = parseHash();
  applyTheme();
  if (PUBLIC.has(name)) return routes[name](arg, q);
  if (!st().onboarded) return routes.welcome();
  if (set().appLock && !unlocked) return lockScreen();
  (routes[name] || routes.home)(arg, q);
}

function applyTheme() {
  document.documentElement.dataset.theme = set().appTheme.toLowerCase().replace(/\s+/g, '-');
}

// ---------- lock ----------
function lockScreen() {
  const hasPin = !!st().pinHash;
  app.innerHTML = `<main class="page lock">
    <div class="logo">🍑</div>
    <h1>${hasPin ? 'Enter your PIN' : 'Set a PIN'}</h1>
    <p class="muted">${hasPin ? 'App lock is on.' : 'Pick 4–8 numbers. You need it each time you open the app.'}</p>
    <form id="pin" class="stack">
      <input name="pin" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="off" type="password" required autofocus aria-label="PIN" class="pin">
      ${hasPin ? '' : `<input name="pin2" inputmode="numeric" pattern="[0-9]{4,8}" type="password" required placeholder="Same PIN again" aria-label="Repeat PIN" class="pin">`}
      <button class="btn primary">${hasPin ? 'Unlock' : 'Save PIN'}</button>
    </form>
    ${hasPin ? `<p class="muted small">Forgot it? Clear this site's data in your browser to start again (this deletes everything).</p>` : ''}
  </main>`;
  bindForm('pin', async (d) => {
    if (!hasPin) {
      if (d.pin !== d.pin2) return toast('PINs do not match');
      const h = await S.hashPin(d.pin);
      S.save((s) => (s.pinHash = h));
      unlocked = true;
      return render();
    }
    if ((await S.hashPin(d.pin)) === st().pinHash) {
      unlocked = true;
      render();
    } else toast('Wrong PIN');
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) lastHidden = Date.now();
  else if (set().appLock && lastHidden && Date.now() - lastHidden > 5 * L.MIN) {
    unlocked = false;
    render();
  }
});

// ---------- welcome ----------
route('welcome', () => {
  page(`<div class="hero"><div class="logo">🍑</div><h1>ButtMate</h1>
  <p>Plan meet-ups, prep time and your partner's "good to go" — without the prep talk.</p></div>
  <ul class="points">
    <li><b>Private.</b> Everything stays on this device.</li>
    <li><b>Prep time</b> is only ever shown to you.</li>
    <li><b>Sharing</b> shows free or busy only. No names, no totals.</li>
  </ul>
  <p class="muted small">For adults 18+. Only add people who are adults and only share links with people who agreed.</p>
  <button class="btn primary" id="start">I'm 18+ — start</button>`);
  document.getElementById('start').onclick = () => {
    S.save((s) => (s.onboarded = true));
    render();
  };
});

// ---------- Home ----------
route('home', () => {
  const now = Date.now();
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const today = allItems(now - 6 * L.HOUR, +end)
    .filter((m) => m.status !== 'Cancelled' && +new Date(m.ends) > now && +new Date(m.starts) <= +end)
    .sort((a, b) => +new Date(a.starts) - +new Date(b.starts));
  const reqs = st().requests.filter((r) => r.status === 'waiting');
  page(
    `<header class="top home"><h1>Today</h1><a class="icon" href="#/settings" aria-label="Settings">⚙</a></header>
    ${reqs.length ? `<section class="card attention"><h2>Waiting for you</h2>${reqs.map((r) => `<div class="row"><div><b>Time request</b><br><span class="muted">${fmtWhen(r.starts)} – ${fmtTime(r.ends)} · from ${e(pname(r.person) )}</span></div><div class="btns"><button class="btn small primary" data-ok="${r.id}">Confirm</button><button class="btn small" data-no="${r.id}">No</button></div></div>`).join('')}</section>` : ''}
    <section class="card"><h2>Today's roster</h2>
      ${today.length ? today.map(itemRow).join('') : `<p class="muted">Nothing planned today.</p>`}
    </section>
    <section class="grid2">
      <a class="tile big" href="#/import"><span>📷</span>Add from screenshots</a>
      <a class="tile big" href="#/check-ready"><span>✅</span>Partner ready check</a>
      <a class="tile" href="#/roster"><span>☰</span>Roster</a>
      <a class="tile" href="#/people"><span>☺</span>People</a>
      <a class="tile" href="#/avail"><span>◷</span>My availability</a>
      <a class="tile" href="#/share"><span>🔗</span>Share my availability</a>
      <a class="tile" href="#/routine"><span>🔁</span>Partner routine</a>
      <a class="tile" href="#/settings"><span>⚙</span>Settings</a>
    </section>`,
    'home'
  );
  app.querySelectorAll('[data-ok]').forEach((b) => (b.onclick = () => confirmRequest(b.dataset.ok, true)));
  app.querySelectorAll('[data-no]').forEach((b) => (b.onclick = () => confirmRequest(b.dataset.no, false)));
});

function itemRow(m) {
  const prepAt = L.blockOf(m).from;
  const href = m.fromRoutine ? '#/routine' : `#/meet/${m.id}`;
  return `<a class="row link" href="${href}">${avatarFor(m.person, 40)}<div class="grow"><b>${fmtTime(m.starts)}</b> · ${e(pname(m.person))}${m.fromRoutine ? ' <span class="chip">routine</span>' : ''}<br>
  <span class="muted small">${m.place ? e(m.place) + ' · ' : ''}${m.prepMinutes ? `prep from ${fmtTime(prepAt)} 🔒` : 'no prep'}</span></div>
  <span class="chip ${m.status.toLowerCase()}">${m.status}</span></a>`;
}

function confirmRequest(id, yes) {
  const r = st().requests.find((x) => x.id === id);
  if (!r) return;
  if (!yes) {
    S.save((s) => (s.requests.find((x) => x.id === id).status = 'declined'));
    toast('Declined');
    return render();
  }
  const p = person(r.person);
  const m = { id: S.uid(), person: r.person || '', starts: r.starts, ends: r.ends, place: '', prepMinutes: p?.usualPrepMinutes || set().defaultPrepMinutes, status: 'Confirmed' };
  const check = L.enoughPrep(m, allItems());
  S.save((s) => {
    s.requests.find((x) => x.id === id).status = 'confirmed';
    s.meetups.push(m);
  });
  if (!check.ok) toast(check.reason);
  done('Time confirmed', `<p class="muted">Tell them it's on. Prep starts ${fmtWhen(L.blockOf(m).from)} 🔒</p>`);
}

// ---------- Screenshot import ----------
let draft = null; // { images:[{id,url}], text, found }

route('import', () => {
  page(
    `${header('Add from screenshots')}
    <p>Pick chat or profile screenshots. Text is read <b>on this device</b>.</p>
    <form id="imp" class="stack">
      <label class="drop"><input type="file" name="files" accept="image/*" multiple id="files"><span>📷 Pick screenshots</span><span id="picked" class="muted small">None picked</span></label>
      <label>Or paste text<textarea name="text" rows="5" placeholder="e.g. Jake, 28 · friday 8pm at mine?"></textarea></label>
      <button class="btn primary" id="readBtn">Read them</button>
      <p id="progress" class="muted small" aria-live="polite"></p>
    </form>
    ${onlyMe('Screenshots stay on this phone. Nothing is saved until you check it.')}`,
    'home'
  );
  const files = document.getElementById('files');
  files.onchange = () => (document.getElementById('picked').textContent = files.files.length ? `${files.files.length} picked` : 'None picked');
  bindForm('imp', async (d) => {
    const list = [...files.files];
    if (!list.length && !d.text.trim()) return toast('Pick a screenshot or paste text');
    const prog = document.getElementById('progress');
    document.getElementById('readBtn').disabled = true;
    let text = d.text || '';
    const images = [];
    const failed = [];
    if (list.length) {
      const results = await readImages(list, (msg) => (prog.textContent = msg));
      for (const r of results) {
        const id = await S.putImage(r.file);
        images.push({ id });
        if (r.error || !r.text.trim()) failed.push(r.file.name);
        else text += '\n' + r.text;
      }
    }
    if (!text.trim()) {
      sessionStorage.setItem('bm.err', `Could not read: ${failed.join(', ') || 'no text found'}. Try a clearer screenshot or paste the text.`);
      return go('#/oops');
    }
    draft = { images, text, failed, found: L.parseScreenshotText(text) };
    go('#/review');
  });
});

route('review', () => {
  if (!draft) return go('#/import');
  const f = draft.found;
  const match = st().people.find((p) => f.person && p.nickname.toLowerCase() === f.person.toLowerCase());
  page(
    `${header('Check what was found', '#/import')}
    <p class="muted">Nothing is saved until you check it. <span class="unsure">?</span> = not sure.</p>
    ${draft.failed.length ? `<p class="warn">Could not read: ${e(draft.failed.join(', '))}</p>` : ''}
    ${f.unsure.length ? `<ul class="warn small">${f.unsure.map((u) => `<li>${e(u)}</li>`).join('')}</ul>` : ''}
    <form id="rev" class="stack">
      <label>Person ${f.personSure ? '' : '<span class="unsure">?</span>'}
        <select name="person">${peopleOptions(match?.id)}${f.person && !match ? `<option value="new" selected>New: ${e(f.person)}</option>` : ''}<option value="new-blank">New person</option></select></label>
      <label>Nickname for a new person<input name="newName" value="${e(match ? '' : f.person)}" placeholder="Nickname"></label>
      <label>Date and time ${f.whenSure ? '' : '<span class="unsure">?</span>'}<input type="datetime-local" name="when" value="${f.when ? toLocalInput(f.when) : ''}"></label>
      <label>Place ${f.placeSure ? '' : '<span class="unsure">?</span>'}<input name="place" value="${e(f.place)}"></label>
      <fieldset><legend>Notes about them</legend>
        ${f.features.length ? f.features.map((x, i) => `<div class="feat"><input type="checkbox" name="f${i}" checked aria-label="Keep"><select name="c${i}">${CATS.map((c) => `<option ${c === x.category ? 'selected' : ''}>${c}</option>`).join('')}</select><input name="v${i}" value="${e(x.value)}">${x.sure === 'yes' ? '' : '<span class="unsure">?</span>'}</div>`).join('') : '<p class="muted small">No details found.</p>'}
        <label>Extra notes<textarea name="notes" rows="2"></textarea></label>
      </fieldset>
      <details><summary>Text that was read</summary><pre class="small">${e(draft.text.trim())}</pre></details>
      <button class="btn primary" name="act" value="meet">Save to roster</button>
      <button class="btn" name="act" value="profile">Save profile</button>
      <button class="btn ghost" type="button" id="discard">Discard</button>
    </form>`,
    'home'
  );
  document.getElementById('discard').onclick = async () => {
    for (const im of draft.images) await S.deleteImage(im.id);
    draft = null;
    toast('Discarded');
    go('#/home');
  };
  bindForm('rev', async (d, form, submitter) => {
    const feats = f.features.map((_, i) => d[`f${i}`] ? { category: d[`c${i}`], value: d[`v${i}`], source: 'screenshot', sure: 'unsure' } : null).filter(Boolean);
    if (d.notes?.trim()) d.notes.split('\n').filter(Boolean).forEach((n) => feats.push({ ...L.categorise(n), source: 'typed' }));
    const pid = buildProfile(d, feats);
    if (submitter?.value === 'meet') {
      if (!d.when) return toast('Add a date and time first');
      draft = null;
      go(`#/plan?person=${pid}&when=${encodeURIComponent(fromLocalInput(d.when))}&place=${encodeURIComponent(d.place || '')}`);
    } else {
      draft = null;
      const p = person(pid);
      const nick = L.suggestNicknames(st().features.filter((x) => x.person === pid));
      done('Profile saved', `<p class="muted">Saved on this device only. Want a nickname instead of a real name?</p><div class="chips">${nick.map((n) => `<button class="chip pick" data-nick="${e(n)}" data-pid="${pid}">${e(n)}</button>`).join('')}</div><a class="btn" href="#/person/${pid}">Open ${e(p.nickname)}</a>`);
    }
  });
});

/** Build profile: match or create person, add sorted features + screenshots to album. */
function buildProfile(d, feats) {
  let pid = d.person;
  return S.save((s) => {
    if (!pid || pid === 'new' || pid === 'new-blank') {
      pid = S.uid();
      s.people.push({ id: pid, nickname: (d.newName || '').trim() || 'New person', relationship: 'One-off', notes: '', usualPrepMinutes: s.settings.defaultPrepMinutes, nicknameStyle: 'typed', createdAt: new Date().toISOString() });
    }
    for (const f of feats) s.features.push({ id: S.uid(), person: pid, ...f });
    for (const im of draft?.images || []) s.album.push({ id: S.uid(), person: pid, imageId: im.id, fromScreenshot: true, addedOn: new Date().toISOString() });
    return pid;
  });
}

// ---------- Roster ----------
route('roster', () => {
  const now = Date.now();
  const items = allItems(now - L.DAY, now + 28 * L.DAY).filter((m) => +new Date(m.ends) > now - 12 * L.HOUR).sort((a, b) => +new Date(a.starts) - +new Date(b.starts));
  const weekEnd = now + 7 * L.DAY;
  const thisWeek = items.filter((m) => +new Date(m.starts) < weekEnd && m.status !== 'Cancelled');
  const later = items.filter((m) => +new Date(m.starts) >= weekEnd && m.status !== 'Cancelled');
  const groups = {};
  for (const m of thisWeek) (groups[fmtDay(m.starts)] ||= []).push(m);
  page(
    `<header class="top home"><h1>Roster</h1></header>
    <div class="btns"><a class="btn primary" href="#/plan">+ New meet-up</a><a class="btn" href="#/several">Plan several</a></div>
    <section class="card"><h2>This week</h2>
    ${Object.keys(groups).length ? Object.entries(groups).map(([day, ms]) => `<h3>${day}</h3>${ms.map(itemRow).join('')}`).join('') : '<p class="muted">Nothing this week.</p>'}
    </section>
    ${later.length ? `<section class="card"><h2>Later</h2>${later.map(itemRow).join('')}</section>` : ''}`,
    'roster'
  );
});

// ---------- Plan a meet-up ----------
route('plan', (arg, q) => {
  const editing = q.id ? st().meetups.find((m) => m.id === q.id) : null;
  const pid = q.person || editing?.person || '';
  const p = person(pid);
  const prep = q.prep || editing?.prepMinutes || p?.usualPrepMinutes || set().defaultPrepMinutes;
  const when = q.when || editing?.starts || '';
  const dur = q.dur || (editing ? (+new Date(editing.ends) - +new Date(editing.starts)) / L.MIN : set().defaultDurationMinutes);
  page(
    `${header(editing ? 'Change meet-up' : 'Plan a meet-up', editing ? `#/meet/${editing.id}` : '#/roster')}
    ${q.msg ? `<p class="warn">${e(q.msg)}</p>` : ''}
    <form id="plan" class="stack">
      <label>Who<select name="person">${peopleOptions(pid)}</select></label>
      <label>When<input type="datetime-local" name="when" required value="${when ? toLocalInput(when) : ''}"></label>
      <label>How long<select name="dur">${[30, 60, 90, 120, 180, 240, 480, 720].map((n) => `<option value="${n}" ${+dur === n ? 'selected' : ''}>${mins(n)}</option>`).join('')}</select></label>
      <label>Where<input name="place" value="${e(q.place ?? editing?.place ?? '')}" placeholder="optional"></label>
      <label>Prep time needed 🔒<select name="prep">${[0, 15, 30, 45, 60, 90, 120, 180].map((n) => `<option value="${n}" ${+prep === n ? 'selected' : ''}>${n ? mins(n) : 'None'}</option>`).join('')}</select></label>
      ${onlyMe('Prep time is only visible to you.')}
      <button class="btn primary">Save</button>
      ${q.msg ? `<button class="btn" name="force" value="1">Save anyway</button>` : ''}
    </form>`,
    'roster'
  );
  bindForm('plan', (d, f, sub) => {
    const starts = fromLocalInput(d.when);
    const m = {
      id: editing?.id || S.uid(),
      person: d.person,
      starts,
      ends: new Date(+new Date(starts) + Number(d.dur) * L.MIN).toISOString(),
      place: d.place.trim(),
      prepMinutes: Number(d.prep),
      status: editing?.status === 'Cancelled' ? 'Planned' : editing?.status || 'Planned',
    };
    saveMeetup(m, sub?.value === '1');
  });
});

/** Save meet-up: check free, block prep, save, offer partner confirm. */
function saveMeetup(m, force = false) {
  const check = L.enoughPrep(m, allItems());
  if (!check.ok && !force) {
    const slot = L.nextFreeSlot({ freeTimes: st().freeTimes, meetups: allItems(), prepMinutes: m.prepMinutes, durationMinutes: (+new Date(m.ends) - +new Date(m.starts)) / L.MIN, ignoreId: m.id });
    const msg = slot ? `${check.reason} Next free slot that fits: ${fmtWhen(slot.starts)}.` : `${check.reason} Add free times so I can suggest a better slot.`;
    const q = new URLSearchParams({ person: m.person, when: slot?.starts || m.starts, place: m.place, prep: m.prepMinutes, dur: (+new Date(m.ends) - +new Date(m.starts)) / L.MIN, msg });
    if (st().meetups.some((x) => x.id === m.id)) q.set('id', m.id);
    return go(`#/plan?${q}`);
  }
  const inFree = !st().freeTimes.length || L.expandFree(st().freeTimes, +new Date(m.starts) - L.DAY, +new Date(m.ends) + L.DAY).some((w) => w.from <= +new Date(m.starts) && w.to >= +new Date(m.ends));
  S.save((s) => {
    const i = s.meetups.findIndex((x) => x.id === m.id);
    if (i >= 0) s.meetups[i] = { ...s.meetups[i], ...m };
    else s.meetups.push(m);
  });
  const link = st().shareLinks.find((l) => l.forPerson === m.person && l.active);
  done('All set', `<p>${fmtWhen(m.starts)}${m.person ? ` with ${e(pname(m.person))}` : ''}.</p>
    ${m.prepMinutes ? `<p class="muted">Prep blocked from ${fmtTime(L.blockOf(m).from)} 🔒 — I'll remind you.</p>` : ''}
    ${inFree ? '' : `<p class="warn small">Heads up: this is outside your saved free times.</p>`}
    ${link ? `<button class="btn" data-share="${link.id}">Ask them to confirm</button>` : ''}`);
}

// ---------- Plan several ----------
let severalDraft = null;
route('several', () => {
  const people = st().people;
  page(
    `${header('Plan several', '#/roster')}
    ${onlyMe('Prep time is never shown to others.')}
    ${!st().freeTimes.length ? `<p class="warn">Add your free times first. <a href="#/avail">My availability</a></p>` : ''}
    <form id="sev" class="stack">
      <fieldset><legend>Who to fit in</legend>
        ${people.length ? people.map((p) => `<label class="check"><input type="checkbox" name="p_${p.id}" ${p.relationship !== 'Partner' ? '' : ''}> ${e(p.nickname)} <span class="muted small">${p.relationship}</span></label>`).join('') : '<p class="muted small">No people yet — slots will be left unnamed.</p>'}
      </fieldset>
      <label>How many<input type="number" name="count" min="1" max="20" value="3"></label>
      <label>Length of each<select name="dur">${[60, 90, 120, 180].map((n) => `<option value="${n}" ${n === 120 ? 'selected' : ''}>${mins(n)}</option>`).join('')}</select></label>
      <label>Gap between<select name="gap">${[30, 60, 120, 240].map((n) => `<option value="${n}">${mins(n)}</option>`).join('')}</select></label>
      <button class="btn primary">Suggest a plan</button>
    </form>
    <div id="planOut"></div>`,
    'roster'
  );
  bindForm('sev', (d) => {
    const chosen = people.filter((p) => d[`p_${p.id}`]);
    severalDraft = L.planSeveral({ people: chosen, count: d.count, freeTimes: st().freeTimes, meetups: allItems(), defaultPrep: set().defaultPrepMinutes, durationMinutes: Number(d.dur), gapMinutes: Number(d.gap) });
    const out = document.getElementById('planOut');
    if (!severalDraft.length) {
      out.innerHTML = `<p class="warn">No slots fit in the next 4 weeks. Add more free time.</p>`;
      return;
    }
    out.innerHTML = `<section class="card"><h2>Check the plan</h2>${severalDraft.map((m) => `<div class="row"><div class="grow"><b>${fmtWhen(m.starts)}</b> · ${e(m.person ? pname(m.person) : 'Open slot')}<br><span class="muted small">prep from ${fmtTime(L.blockOf(m).from)} 🔒</span></div></div>`).join('')}
    ${Number(d.count) > severalDraft.length ? `<p class="warn small">Only ${severalDraft.length} fit.</p>` : ''}
    <button class="btn primary" id="saveSev">Save all</button></section>`;
    document.getElementById('saveSev').onclick = () => {
      try {
        S.save((s) => severalDraft.forEach((m) => s.meetups.push({ ...m, id: S.uid(), person: m.person || '' })));
        const n = severalDraft.length;
        severalDraft = null;
        done('All set', `<p>${n} meet-ups added with prep time blocked 🔒</p>`);
      } catch (err) {
        oops(err.message);
      }
    };
  });
});

// ---------- Meet-up ----------
route('meet', (id) => {
  const m = st().meetups.find((x) => x.id === id);
  if (!m) return go('#/roster');
  const ready = latestReady(m.person);
  const prepAt = L.blockOf(m).from;
  page(
    `${header('Meet-up', '#/roster')}
    <section class="card"><h2>Time and place</h2>
      <div class="row">${avatarFor(m.person, 52)}<div class="grow"><b>${e(pname(m.person))}</b><br>${fmtWhen(m.starts)} – ${fmtTime(m.ends)}<br><span class="muted">${e(m.place || 'No place yet')}</span></div><span class="chip ${m.status.toLowerCase()}">${m.status}</span></div>
    </section>
    <section class="card private-card"><h2>Prep plan 🔒</h2>
      ${m.prepMinutes ? `<p>Start getting ready at <b>${fmtTime(prepAt)}</b> (${mins(m.prepMinutes)}).</p>` : '<p class="muted">No prep time set.</p>'}
      <p class="muted small">Only you see this.</p>
    </section>
    <section class="card"><h2>Partner ready?</h2>${readyText(ready)}</section>
    <div class="stack">
      ${m.status === 'Planned' ? `<button class="btn" id="confirm">Mark confirmed</button>` : ''}
      ${m.status !== 'Cancelled' && m.status !== 'Done' ? `<a class="btn" href="#/plan?id=${m.id}">Change</a><button class="btn" id="resched">Reschedule to next free slot</button><button class="btn" id="doneBtn">Mark done</button><button class="btn danger" id="cancel">Cancel</button>` : ''}
      ${m.status === 'Cancelled' || m.status === 'Done' ? `<button class="btn danger ghost" id="del">Delete from roster</button>` : ''}
    </div>`,
    'roster'
  );
  const upd = (patch, msg) => {
    S.save((s) => Object.assign(s.meetups.find((x) => x.id === id), patch));
    toast(msg);
    render();
  };
  document.getElementById('confirm')?.addEventListener('click', () => upd({ status: 'Confirmed' }, 'Confirmed'));
  document.getElementById('doneBtn')?.addEventListener('click', () => {
    S.save((s) => {
      Object.assign(s.meetups.find((x) => x.id === id), { status: 'Done' });
      const p = s.people.find((x) => x.id === m.person);
      if (p) p.lastSeen = m.starts;
    });
    toast('Marked done');
    render();
  });
  document.getElementById('del')?.addEventListener('click', () => {
    if (!confirm('Delete this from your roster?')) return;
    S.save((s) => (s.meetups = s.meetups.filter((x) => x.id !== id)));
    go('#/roster');
  });
  document.getElementById('resched')?.addEventListener('click', () => {
    const slot = L.nextFreeSlot({ freeTimes: st().freeTimes, meetups: allItems(), prepMinutes: m.prepMinutes, durationMinutes: (+new Date(m.ends) - +new Date(m.starts)) / L.MIN, ignoreId: m.id, after: Math.max(Date.now(), +new Date(m.starts) + 15 * L.MIN) });
    if (!slot) return toast('No free slot found. Add free times first.');
    go(`#/plan?id=${m.id}&when=${encodeURIComponent(slot.starts)}&msg=${encodeURIComponent('Next free slot found. Check it and save.')}`);
  });
  document.getElementById('cancel')?.addEventListener('click', () => {
    if (!confirm('Cancel this meet-up? The time and prep block will be freed up.')) return;
    S.save((s) => (s.meetups.find((x) => x.id === id).status = 'Cancelled'));
    alertMe('Meet-up cancelled');
    go('#/roster');
  });
});

function latestReady(pid) {
  const list = st().readyStatus.filter((r) => !pid || r.person === pid).sort((a, b) => +new Date(b.setAt) - +new Date(a.setAt));
  return list[0];
}
function readyText(r) {
  if (!r) return '<p class="muted">No word yet.</p>';
  const live = +new Date(r.expiresAt) > Date.now();
  if (r.ready && live) return `<p class="ok">✅ Good to go until ${fmtTime(r.expiresAt)}</p>`;
  if (r.ready && !live) return `<p class="muted">Was good to go — ran out at ${fmtWhen(r.expiresAt)}.</p>`;
  return `<p class="muted">Not today (set ${fmtWhen(r.setAt)}).</p>`;
}

// ---------- Partner ready check (decision) + Ready! ----------
route('check-ready', () => {
  const partners = st().people.filter((p) => p.relationship === 'Partner').map((p) => p.id);
  const r = st().readyStatus.filter((x) => !partners.length || partners.includes(x.person)).sort((a, b) => +new Date(b.setAt) - +new Date(a.setAt))[0];
  if (r && r.ready && +new Date(r.expiresAt) > Date.now()) return go(`#/ready?pid=${r.person}`);
  toast(partners.length ? 'Not yet' : 'Add a partner and send them a link first');
  go('#/roster');
});
route('ready', (a, q) => {
  const r = latestReady(q.pid);
  page(
    `<div class="confirm-page"><div class="big-emoji">✅</div><h1>Ready!</h1>
    <p>${e(pname(q.pid))} is good to go${r ? ` until <b>${fmtTime(r.expiresAt)}</b>` : ''}.</p>
    <a class="btn primary" href="#/roster">Open roster</a></div>`,
    'home'
  );
});

// ---------- People ----------
route('people', () => {
  const ppl = [...st().people].sort((a, b) => a.nickname.localeCompare(b.nickname));
  page(
    `<header class="top home"><h1>People</h1></header>
    ${onlyMe('Private list. Never shared, never counted anywhere others can see.')}
    <div class="btns"><a class="btn primary" href="#/person/new">+ Add person</a><a class="btn" href="#/insights">Insights</a></div>
    <section class="card">
      ${ppl.length ? ppl.map((p) => `<a class="row link" href="#/person/${p.id}">${avatarFor(p.id)}<div class="grow"><b>${e(p.nickname)}</b><br><span class="muted small">${p.relationship}${p.lastSeen ? ` · last ${fmtDay(p.lastSeen)}` : ''}</span></div>›</a>`).join('') : '<p class="muted">No one yet. Add from screenshots or tap Add person.</p>'}
    </section>`,
    'people'
  );
});

route('person', (id) => {
  const isNew = id === 'new';
  const p = isNew ? { id: '', nickname: '', relationship: 'Ongoing', notes: '', usualPrepMinutes: set().defaultPrepMinutes } : person(id);
  if (!p) return go('#/people');
  const feats = st().features.filter((f) => f.person === id);
  page(
    `${header(isNew ? 'Add person' : p.nickname, '#/people')}
    ${isNew ? '' : `<div class="person-head">${avatarFor(id, 96)}</div>`}
    <form id="per" class="stack">
      <label>Nickname<input name="nickname" required value="${e(p.nickname)}" placeholder="A nickname, not a real name"></label>
      <label>Relationship<select name="relationship">${RELS.map((r) => `<option ${r === p.relationship ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>What I know about them 🔒<textarea name="notes" rows="3">${e(p.notes)}</textarea></label>
      <label>Usual prep time 🔒<select name="usualPrepMinutes">${[0, 15, 30, 45, 60, 90, 120, 180].map((n) => `<option value="${n}" ${+p.usualPrepMinutes === n ? 'selected' : ''}>${n ? mins(n) : 'None'}</option>`).join('')}</select></label>
      <button class="btn primary">${isNew ? 'Add person' : 'Save'}</button>
    </form>
    ${isNew ? '' : `
    <div id="nickOut"></div>
    <div class="grid2">
      <a class="tile" href="#/plan?person=${id}"><span>📅</span>Plan a meet-up</a>
      <a class="tile" href="#/share?person=${id}"><span>🔗</span>Send them a link</a>
      <a class="tile" href="#/album/${id}"><span>🖼</span>Photo album</a>
      <a class="tile" href="#/avatar/${id}"><span>🎨</span>Avatar</a>
    </div>
    <button class="btn" id="nick">Suggest a nickname</button>
    <section class="card"><h2>Features by category</h2>
      ${CATS.map((c) => {
        const fs = feats.filter((f) => f.category === c);
        return fs.length ? `<h3>${c}</h3><div class="chips">${fs.map((f) => `<span class="chip feat-chip">${e(f.value)}${f.sure === 'yes' ? '' : ' <span class="unsure" title="Not sure">?</span>'}<button aria-label="Remove" data-delf="${f.id}">×</button></span>`).join('')}</div>` : '';
      }).join('') || '<p class="muted small">Nothing yet.</p>'}
      <form id="addf" class="inline"><input name="note" placeholder="Add a detail, e.g. 'tall, into climbing'" required><button class="btn small">Add</button></form>
      <p class="muted small">Details are sorted into categories for you. Tap × to remove.</p>
    </section>
    <button class="btn danger ghost" id="delp">Delete this person</button>`}`,
    'people'
  );
  bindForm('per', (d) => {
    if (isNew) {
      const nid = S.uid();
      S.save((s) => s.people.push({ id: nid, ...d, usualPrepMinutes: Number(d.usualPrepMinutes), nicknameStyle: 'typed', createdAt: new Date().toISOString() }));
      go(`#/person/${nid}`);
    } else {
      S.save((s) => Object.assign(s.people.find((x) => x.id === id), { ...d, usualPrepMinutes: Number(d.usualPrepMinutes) }));
      toast('Saved');
    }
  });
  if (isNew) return;
  bindForm('addf', (d) => {
    const parts = d.note.split(/,|;|\n/).map((x) => x.trim()).filter(Boolean);
    S.save((s) => parts.forEach((n) => s.features.push({ id: S.uid(), person: id, ...L.categorise(n), source: 'typed' })));
    render();
  });
  app.querySelectorAll('[data-delf]').forEach((b) => (b.onclick = () => { S.save((s) => (s.features = s.features.filter((f) => f.id !== b.dataset.delf))); render(); }));
  let seed = 0;
  document.getElementById('nick').onclick = () => {
    const names = L.suggestNicknames(st().features.filter((f) => f.person === id), seed++);
    document.getElementById('nickOut').innerHTML = `<section class="card"><h2>Pick one</h2><div class="chips">${names.map((n) => `<button class="chip pick" data-nick="${e(n)}" data-pid="${id}">${e(n)}</button>`).join('')}</div><p class="muted small">Or keep your own. Tap again for more.</p></section>`;
  };
  document.getElementById('delp').onclick = async () => {
    if (!confirm(`Delete ${p.nickname}, their notes, album and avatar? This can't be undone.`)) return;
    const imgs = st().album.filter((a) => a.person === id);
    for (const a of imgs) { await S.deleteImage(a.imageId); if (a.coveredImageId) await S.deleteImage(a.coveredImageId); }
    S.save((s) => {
      s.people = s.people.filter((x) => x.id !== id);
      s.features = s.features.filter((x) => x.person !== id);
      s.album = s.album.filter((x) => x.person !== id);
      s.avatars = s.avatars.filter((x) => x.person !== id);
      s.meetups.forEach((m) => { if (m.person === id) m.person = ''; });
    });
    go('#/people');
  };
});

// nickname chips (on person page and profile-saved page)
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-nick]');
  if (b) {
    S.save((s) => Object.assign(s.people.find((x) => x.id === b.dataset.pid), { nickname: b.dataset.nick, nicknameStyle: 'suggested' }));
    toast(`Nickname set: ${b.dataset.nick}`);
    if (parseHash().name === 'person') render();
  }
  const sh = ev.target.closest('[data-share]');
  if (sh) {
    const l = st().shareLinks.find((x) => x.id === sh.dataset.share);
    if (l) shareOrCopy(buildLink(l), 'Can you confirm this time?');
  }
});

// ---------- Insights ----------
route('insights', (a, q) => {
  const cat = q.cat || 'Looks';
  const rows = L.insights(st().features, cat);
  page(
    `${header('Insights', '#/people')}
    ${onlyMe('Patterns in the categories you choose. Never shared.')}
    <label>Pick an attribute<select id="cat">${CATS.map((c) => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <section class="card"><h2>Results</h2>
      ${rows.length ? rows.map(([v, n]) => `<div class="bar"><span>${e(v)}</span><span class="track"><span style="width:${(n / rows[0][1]) * 100}%"></span></span><b>${n}</b></div>`).join('') : '<p class="muted">Nothing saved in this category yet.</p>'}
    </section>`,
    'people'
  );
  document.getElementById('cat').onchange = (ev) => go(`#/insights?cat=${ev.target.value}`);
});

// ---------- Photo album + cover private areas ----------
route('album', async (id) => {
  const p = person(id);
  if (!p) return go('#/people');
  const items = st().album.filter((a) => a.person === id);
  page(
    `${header(`${p.nickname}'s album`, `#/person/${id}`)}
    ${onlyMe('Only visible to you. Kept on this phone.')}
    <div class="btns"><label class="btn"><input type="file" accept="image/*" multiple id="addImg" hidden>+ Add photos</label><a class="btn primary" href="#/avatar/${id}">Make avatar</a></div>
    <section class="album" id="alb">${items.length ? items.map((a) => `<figure data-id="${a.id}"><img alt="" data-img="${a.coveredImageId || a.imageId}"><figcaption>${a.coveredImageId ? '<span class="chip ok">covered</span>' : ''}<button class="btn small" data-cover="${a.id}">Cover</button><button class="btn small ghost" data-delimg="${a.id}">Delete</button></figcaption></figure>`).join('') : '<p class="muted">No images yet.</p>'}</section>`,
    'people'
  );
  for (const img of app.querySelectorAll('[data-img]')) img.src = await S.imageURL(img.dataset.img);
  document.getElementById('addImg').onchange = async (ev) => {
    for (const f of ev.target.files) {
      const iid = await S.putImage(f);
      S.save((s) => s.album.push({ id: S.uid(), person: id, imageId: iid, fromScreenshot: false, addedOn: new Date().toISOString() }));
    }
    render();
  };
  app.querySelectorAll('[data-delimg]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this image?')) return;
    const a = st().album.find((x) => x.id === b.dataset.delimg);
    await S.deleteImage(a.imageId);
    if (a.coveredImageId) await S.deleteImage(a.coveredImageId);
    S.save((s) => (s.album = s.album.filter((x) => x.id !== a.id)));
    render();
  }));
  app.querySelectorAll('[data-cover]').forEach((b) => (b.onclick = () => go(`#/cover/${b.dataset.cover}`)));
});

route('cover', async (albumId) => {
  const a = st().album.find((x) => x.id === albumId);
  if (!a) return go('#/people');
  page(
    `${header('Cover private areas', `#/album/${a.person}`)}
    <p>Drag over anything bare, private or off limits (faces, tattoos, backgrounds). The original is never changed.</p>
    <div class="seg" role="group"><button class="on" data-tool="cover">👕 Cover</button><button data-tool="blur">▦ Blur</button><button id="undo">↶ Undo</button></div>
    <div class="canvas-wrap"><canvas id="cv"></canvas></div>
    <button class="btn primary" id="approve">Looks good — save covered copy</button>
    ${onlyMe('Covering happens on this phone. You mark the areas yourself — nothing is sent anywhere.')}`,
    'people'
  );
  const url = await S.imageURL(a.imageId);
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => {});
  const cv = document.getElementById('cv');
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  cv.width = img.width * scale;
  cv.height = img.height * scale;
  const ctx = cv.getContext('2d');
  const boxes = [];
  let tool = 'cover';
  const draw = (tmp) => {
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    for (const b of [...boxes, ...(tmp ? [tmp] : [])]) {
      const [x, y, w, h] = norm(b);
      if (b.tool === 'cover') {
        ctx.fillStyle = '#E2805F';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, Math.min(24, w / 4, h / 4));
        ctx.fill();
      } else pixelate(ctx, x, y, w, h);
    }
  };
  const norm = (b) => [Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1)];
  draw();
  let cur = null;
  const pos = (ev) => {
    const r = cv.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * cv.width, ((ev.clientY - r.top) / r.height) * cv.height];
  };
  cv.onpointerdown = (ev) => { cv.setPointerCapture(ev.pointerId); const [x, y] = pos(ev); cur = { tool, x1: x, y1: y, x2: x, y2: y }; };
  cv.onpointermove = (ev) => { if (!cur) return; [cur.x2, cur.y2] = pos(ev); draw(cur); };
  cv.onpointerup = () => { if (cur && Math.abs(cur.x2 - cur.x1) > 4) boxes.push(cur); cur = null; draw(); };
  app.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => { tool = b.dataset.tool; app.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); }));
  document.getElementById('undo').onclick = () => { boxes.pop(); draw(); };
  document.getElementById('approve').onclick = async () => {
    if (!boxes.length && !confirm('Nothing covered. Save as covered anyway?')) return;
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
    const cid = await S.putImage(blob);
    if (a.coveredImageId) await S.deleteImage(a.coveredImageId);
    S.save((s) => (s.album.find((x) => x.id === albumId).coveredImageId = cid));
    toast('Covered copy saved');
    go(`#/album/${a.person}`);
  };
});
function pixelate(ctx, x, y, w, h) {
  if (w < 2 || h < 2) return;
  const size = Math.max(8, Math.round(Math.max(w, h) / 12));
  const data = ctx.getImageData(x, y, w, h);
  for (let py = 0; py < h; py += size) for (let px = 0; px < w; px += size) {
    const i = (Math.floor(py) * Math.floor(w) + Math.floor(px)) * 4;
    ctx.fillStyle = `rgb(${data.data[i]},${data.data[i + 1]},${data.data[i + 2]})`;
    ctx.fillRect(x + px, y + py, size, size);
  }
}

// ---------- Avatar maker ----------
route('avatar', (id) => {
  const p = person(id);
  if (!p) return go('#/people');
  const existing = st().avatars.find((a) => a.person === id);
  const feats = st().features.filter((f) => f.person === id);
  let opts = existing?.options || fromFeatures(feats);
  opts.custom = [...(opts.custom || [])];
  const globalTemplates = st().templates.filter((t) => t.savedFor === 'all avatars').map((t) => t.name);
  let drawing = existing?.drawing || '';
  const style = set().cartoonAvatarStyle;
  const covered = st().album.filter((a) => a.person === id && a.coveredImageId).length;
  page(
    `${header('Avatar maker', `#/person/${id}`)}
    ${onlyMe('Only visible to you.')}
    <div class="avatar-stage"><div id="prev"></div><canvas id="drawc" width="200" height="200" aria-label="Draw on avatar"></canvas></div>
    <div class="seg"><button id="drawOn">✏️ Draw features</button><button id="clearDraw">Clear drawing</button></div>
    <form id="avf" class="grid2 tight">
      ${Object.entries({ skin: 'Skin', hair: 'Hair', hairColour: 'Hair colour', facialHair: 'Facial hair', glasses: 'Glasses', top: 'Top', extra: 'Extra' }).map(([k, label]) => {
        const vals = Array.isArray(OPTIONS[k]) ? OPTIONS[k] : Object.keys(OPTIONS[k]);
        return `<label>${label}<select name="${k}">${vals.map((v) => `<option ${opts[k] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
      }).join('')}
    </form>
    <label>Describe features<textarea id="desc" rows="2" placeholder="e.g. beard, glasses, curly ginger hair">${e(existing?.features || '')}</textarea></label>
    <button class="btn" id="applyDesc">Apply description</button>
    ${globalTemplates.length || opts.custom.length ? `<p class="small muted">Custom features: ${e([...new Set([...opts.custom, ...globalTemplates])].join(', '))}</p>` : ''}
    <div class="stack">
      <button class="btn" id="useCovered">Use covered photos ${covered ? `(${covered})` : ''}</button>
      <a class="btn" href="#/album/${id}">Upload photos (you'll cover them first)</a>
      <a class="btn" href="#/feature/${id}">Ask AI for a custom feature</a>
      <button class="btn primary" id="saveAv">Save avatar</button>
    </div>
    <p class="muted small">Style: ${e(style)} · change it in Settings › Appearance. Avatars are always drawn clothed.</p>`,
    'people'
  );
  const prev = document.getElementById('prev');
  const dc = document.getElementById('drawc');
  const dctx = dc.getContext('2d');
  if (drawing) { const im = new Image(); im.onload = () => dctx.drawImage(im, 0, 0); im.src = drawing; }
  const allCustom = () => [...new Set([...opts.custom, ...globalTemplates])];
  const refresh = () => (prev.innerHTML = renderAvatar({ ...opts, custom: allCustom() }, style));
  refresh();
  document.getElementById('avf').onchange = (ev) => { opts[ev.target.name] = ev.target.value; refresh(); };
  document.getElementById('applyDesc').onclick = () => {
    const t = document.getElementById('desc').value;
    const guess = fromFeatures([{ value: t }]);
    for (const k of Object.keys(DEFAULT_AVATAR)) if (k !== 'custom' && guess[k] !== DEFAULT_AVATAR[k]) opts[k] = guess[k];
    const tone = Object.keys(OPTIONS.skin).find((s) => new RegExp(`\\b${s}\\b`, 'i').test(t));
    if (tone) opts.skin = tone;
    const col = Object.keys(OPTIONS.hairColour).find((s) => new RegExp(`\\b${s}`, 'i').test(t));
    if (col) opts.hairColour = col;
    for (const sel of document.querySelectorAll('#avf select')) sel.value = opts[sel.name];
    refresh();
    toast('Applied');
  };
  let drawing_on = false, painting = false;
  document.getElementById('drawOn').onclick = (ev) => { drawing_on = !drawing_on; ev.target.classList.toggle('on', drawing_on); dc.classList.toggle('active', drawing_on); };
  document.getElementById('clearDraw').onclick = () => { dctx.clearRect(0, 0, 200, 200); drawing = ''; };
  const dpos = (ev) => { const r = dc.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * 200, ((ev.clientY - r.top) / r.height) * 200]; };
  dc.onpointerdown = (ev) => { if (!drawing_on) return; painting = true; dc.setPointerCapture(ev.pointerId); dctx.beginPath(); dctx.moveTo(...dpos(ev)); };
  dc.onpointermove = (ev) => { if (!painting) return; dctx.lineTo(...dpos(ev)); dctx.strokeStyle = '#222'; dctx.lineWidth = 3; dctx.lineCap = 'round'; dctx.stroke(); };
  dc.onpointerup = () => (painting = false);
  // Decision: "Safe to send to AI?" — needs the AI setting on AND covered photos.
  document.getElementById('useCovered').onclick = () => {
    if (!covered) { toast('Add and cover a photo first'); return go(`#/album/${id}`); }
    if (!set().aiAvatarHelp) return toast('AI avatar help is off, so photos stay on your phone. Match the look with the options above.');
    toast('No AI service is connected in this version. Photos stayed on your phone.');
  };
  document.getElementById('saveAv').onclick = () => {
    const hasDrawing = dctx.getImageData(0, 0, 200, 200).data.some((v, i) => i % 4 === 3 && v);
    drawing = hasDrawing ? dc.toDataURL('image/png') : '';
    const svg = renderAvatar({ ...opts, custom: allCustom() }, style, drawing);
    const desc = document.getElementById('desc').value;
    S.save((s) => {
      s.avatars = s.avatars.filter((a) => a.person !== id);
      s.avatars.push({ id: S.uid(), person: id, svg, options: opts, drawing, style, features: desc, madeBy: drawing ? 'drawn' : desc ? 'described' : 'drawn' });
    });
    toast('Avatar saved');
    go(`#/person/${id}`);
  };
});

route('feature', (id) => {
  const p = person(id);
  if (!p) return go('#/people');
  page(
    `${header('Custom feature', `#/avatar/${id}`)}
    ${onlyMe('Only visible to you.')}
    <form id="cf" class="stack">
      <label>Describe the feature<input name="desc" required maxlength="24" placeholder="e.g. nose ring, freckles, mullet"></label>
      <label>Save for<select name="savedFor"><option value="one person">Just ${e(p.nickname)}</option><option value="all avatars">All avatars (template)</option></select></label>
      <button class="btn primary">Create it</button>
    </form>
    <p class="muted small">AI drawing isn't connected in this version, so the feature is added as a label on the avatar. ${set().aiAvatarHelp ? '' : 'AI avatar help is also turned off in Settings.'}</p>`,
    'people'
  );
  bindForm('cf', (d) => {
    S.save((s) => {
      s.templates.push({ id: S.uid(), name: d.desc.trim(), description: d.desc.trim(), savedFor: d.savedFor });
      if (d.savedFor === 'one person') {
        let a = s.avatars.find((x) => x.person === id);
        if (!a) { a = { id: S.uid(), person: id, options: { ...DEFAULT_AVATAR, custom: [] }, style: s.settings.cartoonAvatarStyle, madeBy: 'described' }; s.avatars.push(a); }
        a.options.custom = [...(a.options.custom || []), d.desc.trim()];
        a.svg = renderAvatar(a.options, s.settings.cartoonAvatarStyle, a.drawing);
      }
    });
    toast('Feature added');
    go(`#/avatar/${id}`);
  });
});

// ---------- Partner routine ----------
route('routine', () => {
  const partners = st().people.filter((p) => p.relationship === 'Partner');
  const list = st().routines;
  page(
    `${header('Partner routine')}
    ${onlyMe('Set repeating times with your partner. Prep time is only visible to you.')}
    ${list.length ? `<section class="card"><h2>Current routines</h2>${list.map((r) => `<div class="row"><div class="grow"><b>${r.days.map((d) => L.DAYS[d]).join(', ')} at ${e(r.time)}</b><br><span class="muted small">${e(pname(r.person))} · ${r.repeats} · prep ${mins(r.prepMinutes)} 🔒</span></div><button class="btn small ghost" data-delr="${r.id}">Remove</button></div>`).join('')}</section>` : ''}
    <form id="rt" class="stack">
      <label>Partner<select name="person">${partners.length ? partners.map((p) => `<option value="${p.id}">${e(p.nickname)}</option>`).join('') : `<option value="">No partner yet (set Relationship to Partner)</option>`}</select></label>
      <fieldset><legend>Days and times</legend><div class="days">${L.DAYS.map((d, i) => `<label class="day"><input type="checkbox" name="d${i}"><span>${d}</span></label>`).join('')}</div>
      <label>Time<input type="time" name="time" required value="20:00"></label></fieldset>
      <label>How long<select name="dur">${[30, 60, 90, 120, 180].map((n) => `<option value="${n}" ${n === 60 ? 'selected' : ''}>${mins(n)}</option>`).join('')}</select></label>
      <label>Repeats<select name="repeats"><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option></select></label>
      <label>Prep time 🔒<select name="prep">${[0, 15, 30, 45, 60, 90, 120].map((n) => `<option value="${n}" ${n === set().defaultPrepMinutes ? 'selected' : ''}>${n ? mins(n) : 'None'}</option>`).join('')}</select></label>
      <button class="btn primary">Save routine</button>
    </form>`,
    'home'
  );
  app.querySelectorAll('[data-delr]').forEach((b) => (b.onclick = () => { if (confirm('Remove this routine?')) { S.save((s) => (s.routines = s.routines.filter((r) => r.id !== b.dataset.delr))); render(); } }));
  bindForm('rt', (d) => {
    const days = L.DAYS.map((_, i) => (d[`d${i}`] ? i : -1)).filter((i) => i >= 0);
    if (!days.length) return toast('Pick at least one day');
    const r = { id: S.uid(), person: d.person, days, time: d.time, durationMinutes: Number(d.dur), repeats: d.repeats, prepMinutes: Number(d.prep), anchor: new Date().toISOString() };
    const occ = L.expandRoutine(r, Date.now(), Date.now() + 28 * L.DAY);
    const clashing = occ.filter((o) => L.clashes(o, allItems()).length);
    S.save((s) => s.routines.push(r));
    const link = st().shareLinks.find((l) => l.forPerson === d.person && l.active);
    done('All set', `<p>Routine saved: ${days.map((x) => L.DAYS[x]).join(', ')} at ${e(d.time)}, ${d.repeats}.</p>
      ${clashing.length ? `<p class="warn small">${clashing.length} upcoming time(s) clash with other plans: ${clashing.slice(0, 3).map((o) => fmtWhen(o.starts)).join('; ')}</p>` : ''}
      ${link ? `<button class="btn" data-share="${link.id}">Ask partner to confirm</button>` : ''}`);
  });
});

// ---------- Availability ----------
route('avail', () => {
  const now = Date.now();
  const list = st().freeTimes.filter((f) => f.repeats === 'weekly' || +new Date(f.ends) > now).sort((a, b) => +new Date(a.starts) - +new Date(b.starts));
  const d0 = new Date(); d0.setHours(19, 0, 0, 0); if (+d0 < now) d0.setDate(d0.getDate() + 1);
  page(
    `<header class="top home"><h1>My availability</h1></header>
    <section class="card"><h2>Free times</h2>
      ${list.length ? list.map((f) => `<div class="row"><div class="grow"><b>${f.repeats === 'weekly' ? `Every ${L.DAYS[new Date(f.starts).getDay()]}` : fmtDay(f.starts)}</b> ${fmtTime(f.starts)} – ${fmtTime(f.ends)}</div><button class="btn small ghost" data-delfree="${f.id}">Remove</button></div>`).join('') : '<p class="muted">No free times yet.</p>'}
    </section>
    <form id="fr" class="card stack"><h2>Add free time</h2>
      <label>From<input type="datetime-local" name="starts" required value="${toLocalInput(d0)}"></label>
      <label>Until<input type="datetime-local" name="ends" required value="${toLocalInput(+d0 + 4 * L.HOUR)}"></label>
      <label>Repeats<select name="repeats"><option value="never">Just once</option><option value="weekly">Every week</option></select></label>
      <button class="btn primary">Add free time</button>
    </form>
    <form id="dp" class="card stack"><label>Default prep time 🔒<select name="p">${[0, 15, 30, 45, 60, 90, 120, 180].map((n) => `<option value="${n}" ${n === set().defaultPrepMinutes ? 'selected' : ''}>${n ? mins(n) : 'None'}</option>`).join('')}</select></label></form>
    <a class="btn" href="#/share">Share my availability</a>`,
    'avail'
  );
  document.querySelector('#dp select').onchange = (ev) => { S.save((s) => (s.settings.defaultPrepMinutes = Number(ev.target.value))); toast('Saved'); };
  app.querySelectorAll('[data-delfree]').forEach((b) => (b.onclick = () => { S.save((s) => (s.freeTimes = s.freeTimes.filter((f) => f.id !== b.dataset.delfree))); render(); }));
  bindForm('fr', (d) => {
    const f = { id: S.uid(), starts: fromLocalInput(d.starts), ends: fromLocalInput(d.ends), repeats: d.repeats };
    if (+new Date(f.ends) <= +new Date(f.starts)) return toast('"Until" must be after "From"');
    S.save((s) => s.freeTimes.push(f));
    // Re-check upcoming meet-ups for clashes with free times
    const windows = L.expandFree(st().freeTimes, now, now + 28 * L.DAY);
    const outside = st().meetups.filter((m) => m.status !== 'Cancelled' && +new Date(m.starts) > now && !windows.some((w) => w.from <= L.blockOf(m).from && w.to >= +new Date(m.ends)));
    toast(outside.length ? `Saved. ${outside.length} meet-up(s) are outside your free times.` : 'Free time saved');
    render();
  });
});

// ---------- Share ----------
function buildLink(l) {
  const free = L.freeBusyView({ freeTimes: st().freeTimes, meetups: allItems(), days: 14 }).map(([a, b]) => [Math.round(a / L.MIN), Math.round(b / L.MIN)]);
  const payload = { v: 1, id: l.id, exp: l.expiresOn, free, partner: l.partnerButton ? 1 : 0, at: Math.round(Date.now() / L.MIN) };
  return `${baseURL()}#/s/${L.encodePayload(payload)}`;
}
route('share', (a, q) => {
  const links = st().shareLinks.filter((l) => l.active && +new Date(l.expiresOn) > Date.now());
  page(
    `${header('Share my availability', '#/avail')}
    <p class="private">🔒 Shared links show <b>free or busy only</b>. Never names, meet-ups, totals, profiles, albums or avatars.</p>
    <form id="sh" class="stack">
      <label>Who can see it<select name="forPerson"><option value="">Anyone I send it to</option>${peopleOptions(q.person, false)}</select></label>
      <label>Link works for<select name="days"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option></select></label>
      <label class="check"><input type="checkbox" name="partnerButton" ${person(q.person)?.relationship === 'Partner' ? 'checked' : ''}> Include the "I'm good to go" button (for a partner)</label>
      <button class="btn primary">Create link</button>
    </form>
    ${links.length ? `<section class="card"><h2>Active links</h2>${links.map((l) => `<div class="row"><div class="grow"><b>${l.forPerson ? e(pname(l.forPerson)) : 'Anyone with link'}</b><br><span class="muted small">until ${fmtDay(l.expiresOn)}${l.partnerButton ? ' · ready button' : ''}</span></div><div class="btns"><button class="btn small" data-share="${l.id}">Send</button><button class="btn small danger" data-stop="${l.id}">Stop sharing</button></div></div>`).join('')}
      <p class="muted small">Links carry a snapshot of your free times. Send a fresh one after changes. "Stop sharing" makes this app ignore replies from that link straight away; a copy already opened still shows its old free times until it expires.</p></section>` : ''}`,
    'avail'
  );
  app.querySelectorAll('[data-stop]').forEach((b) => (b.onclick = () => { S.save((s) => (s.shareLinks.find((l) => l.id === b.dataset.stop).active = false)); toast('Sharing stopped'); render(); }));
  bindForm('sh', async (d) => {
    if (!st().freeTimes.length && !confirm('You have no free times saved, so the link will show nothing free. Create it anyway?')) return;
    const l = { id: S.uid().slice(0, 12), forPerson: d.forPerson || '', showsOnly: 'free', expiresOn: new Date(Date.now() + Number(d.days) * L.DAY).toISOString(), partnerButton: !!d.partnerButton, active: true };
    S.save((s) => s.shareLinks.push(l));
    const url = buildLink(l);
    page(`${header('Link ready', '#/share')}<section class="card"><p>Send this private link. It shows free/busy only.</p><input readonly value="${e(url)}" id="lnk" onclick="this.select()"><div class="btns"><button class="btn primary" id="cp">Copy / share link</button></div></section>`, 'avail');
    document.getElementById('cp').onclick = () => shareOrCopy(url, 'My free times');
  });
});

// ---------- Shared availability (partner / shared viewer) ----------
function sharedPayload(arg) {
  const p = L.decodePayload(arg.split('/')[0]);
  if (!p || p.v !== 1) return null;
  return p;
}
route('s', (arg) => {
  const p = sharedPayload(arg);
  document.documentElement.dataset.theme = 'midnight-coral';
  if (!p) return publicMsg('This link does not work', 'Ask for a new link.');
  if (+new Date(p.exp) < Date.now()) return publicMsg('This link has run out', 'Ask for a new link.');
  const free = p.free.map(([a, b]) => [a * L.MIN, b * L.MIN]).filter(([, b]) => b > Date.now());
  const byDay = {};
  for (const [a, b] of free) (byDay[fmtDay(a)] ||= []).push([a, b]);
  app.innerHTML = `<main class="page public">
    <header class="top home"><h1>Free times</h1></header>
    <p class="muted">Tap a time to ask for it. They'll confirm.</p>
    ${p.partner ? `<a class="btn primary big-btn" href="#/g/${arg}">I'm good to go…</a>` : ''}
    <section class="card">${Object.keys(byDay).length ? Object.entries(byDay).map(([day, slots]) => `<h3>${day}</h3><div class="chips">${slots.map(([a, b]) => `<button class="chip slot" data-a="${a}" data-b="${b}">${fmtTime(a)} – ${fmtTime(b)}</button>`).join('')}</div>`).join('') : '<p class="muted">No free times right now.</p>'}</section>
    <p class="muted small">Snapshot from ${fmtWhen(p.at * L.MIN)}. Free or busy only.</p>
  </main>`;
  app.querySelectorAll('.slot').forEach((b) => (b.onclick = () => requestTime(p, +b.dataset.a, +b.dataset.b)));
});
function requestTime(p, a, b) {
  app.innerHTML = `<main class="page public">${`<header class="top"><a class="back" href="${location.hash}">‹</a><h1>Request a time</h1></header>`}
  <form id="rq" class="stack"><p>Free ${fmtDay(a)}, ${fmtTime(a)} – ${fmtTime(b)}.</p>
  <label>Start<input type="time" name="t" value="${new Date(a).toTimeString().slice(0, 5)}"></label>
  <label>How long<select name="d">${[30, 60, 90, 120, 180].map((n) => `<option value="${n}" ${n === 60 ? 'selected' : ''}>${mins(n)}</option>`).join('')}</select></label>
  <button class="btn primary">Send request</button></form></main>`;
  document.getElementById('rq').onsubmit = (ev) => {
    ev.preventDefault();
    const d = formData(ev.target);
    const s = new Date(a);
    const [hh, mm] = d.t.split(':').map(Number);
    s.setHours(hh, mm, 0, 0);
    let start = +s, end = start + Number(d.d) * L.MIN;
    if (start < a || end > b) return toast('Pick a time inside the free slot');
    const reply = `${baseURL()}#/in/${L.encodePayload({ v: 1, t: 'req', l: p.id, s: Math.round(start / L.MIN), e: Math.round(end / L.MIN) })}`;
    sendReply(reply, 'Request sent', 'Send this to them so they can confirm. The time is held until they do.');
  };
}
function sendReply(url, title, note) {
  app.innerHTML = `<main class="page public"><div class="confirm-page"><div class="big-emoji">📨</div><h1>${e(title)}</h1><p>${e(note)}</p>
  <button class="btn primary" id="snd">Send it</button><input readonly value="${e(url)}" onclick="this.select()"></div></main>`;
  document.getElementById('snd').onclick = () => shareOrCopy(url, 'Plans updated');
  shareOrCopy(url, 'Plans updated');
}
function publicMsg(t, m) {
  app.innerHTML = `<main class="page public"><div class="confirm-page"><div class="big-emoji">⚠️</div><h1>${e(t)}</h1><p class="muted">${e(m)}</p></div></main>`;
}

// ---------- I'm good to go (partner) ----------
route('g', (arg) => {
  const p = sharedPayload(arg);
  document.documentElement.dataset.theme = 'midnight-coral';
  if (!p || !p.partner) return publicMsg('This link does not work', 'Ask for a new link.');
  if (+new Date(p.exp) < Date.now()) return publicMsg('This link has run out', 'Ask for a new link.');
  app.innerHTML = `<main class="page public"><header class="top"><a class="back" href="#/s/${arg}">‹</a><h1>Ready check</h1></header>
  <p class="muted">One tap. No prep talk needed.</p>
  <form id="gg" class="stack">
    <label class="toggle big"><input type="checkbox" name="ready" checked><span class="sw"></span> I'm good to go</label>
    <label>Ready for how long?<select name="h"><option value="1">1 hour</option><option value="2" selected>2 hours</option><option value="4">4 hours</option><option value="tonight">Until midnight</option></select></label>
    <button class="btn primary">Send</button>
    <button class="btn" type="button" id="nt">Not today</button>
  </form></main>`;
  const send = (ready, h) => {
    let exp;
    if (h === 'tonight') { const d = new Date(); d.setHours(23, 59, 0, 0); exp = +d; } else exp = Date.now() + Number(h || 12) * L.HOUR;
    const url = `${baseURL()}#/in/${L.encodePayload({ v: 1, t: 'ready', l: p.id, r: ready ? 1 : 0, x: Math.round(exp / L.MIN), at: Math.round(Date.now() / L.MIN) })}`;
    sendReply(url, ready ? "You're good to go" : 'Not today — got it', 'Send this so they know. It only says ready or not.');
  };
  document.getElementById('gg').onsubmit = (ev) => { ev.preventDefault(); const d = formData(ev.target); send(!!d.ready, d.h); };
  document.getElementById('nt').onclick = () => send(false, 12);
});

// ---------- Incoming reply (owner opens a link their partner sent back) ----------
route('in', (arg) => {
  const p = L.decodePayload(arg);
  if (!p || p.v !== 1) return oops('That reply link did not work.');
  const link = st().shareLinks.find((l) => l.id === p.l);
  if (!link || !link.active) { toast('That link was stopped — reply ignored'); return go('#/home'); }
  if (p.t === 'ready') {
    const key = `${p.l}:${p.at}`;
    if (!st().readyStatus.some((r) => r.key === key)) S.save((s) => s.readyStatus.push({ id: S.uid(), key, person: link.forPerson, ready: !!p.r, setAt: new Date(p.at * L.MIN).toISOString(), expiresAt: new Date(p.x * L.MIN).toISOString() }));
    alertMe(p.r ? 'Partner is good to go' : 'Partner: not today');
    return go(p.r ? `#/ready?pid=${link.forPerson}` : '#/home');
  }
  if (p.t === 'req') {
    const key = `${p.l}:${p.s}`;
    if (!st().requests.some((r) => r.key === key)) S.save((s) => s.requests.push({ id: S.uid(), key, person: link.forPerson, starts: new Date(p.s * L.MIN).toISOString(), ends: new Date(p.e * L.MIN).toISOString(), status: 'waiting' }));
    alertMe('New time request');
    return go('#/home');
  }
  go('#/home');
});

// ---------- Settings ----------
function toggle(key, label, hint = '') {
  return `<label class="toggle"><input type="checkbox" data-set="${key}" ${set()[key] ? 'checked' : ''}><span class="sw"></span><span><b>${label}</b>${hint ? `<br><span class="muted small">${hint}</span>` : ''}</span></label>`;
}
route('settings', () => {
  page(
    `<header class="top home"><h1>Settings</h1></header>
    <section class="card stack">
      ${toggle('appLock', 'App lock', 'Ask for your PIN when opening')}
      ${st().pinHash ? `<button class="btn small" id="chpin">Change PIN</button>` : ''}
      ${toggle('discreetAlerts', 'Discreet alerts', 'Only "Plans updated" — no details on the lock screen')}
      <label class="toggle locked"><input type="checkbox" checked disabled><span class="sw"></span><span><b>Hide private details when sharing</b><br><span class="muted small">Always on. Links show free/busy only.</span></span></label>
      ${toggle('healthReminders', 'Health check reminders', 'A plain reminder every 3 months')}
      ${toggle('aiAvatarHelp', 'Allow AI avatar help', 'Off keeps all photos on this phone')}
      <label class="toggle locked"><input type="checkbox" checked disabled><span class="sw"></span><span><b>Keep profiles on this device only</b><br><span class="muted small">Always on in this version</span></span></label>
      <button class="btn small" id="notif">Allow notifications</button>
    </section>
    <a class="btn" href="#/appearance">Appearance</a>
    <section class="card stack"><h2>Your data</h2>
      <button class="btn small" id="exp">Download a backup</button>
      <button class="btn small danger" id="wipe">Delete everything</button>
    </section>
    <a class="btn ghost" href="#/home">Back to home</a>`,
    'settings'
  );
  app.querySelectorAll('[data-set]').forEach((c) => (c.onchange = () => {
    S.save((s) => (s.settings[c.dataset.set] = c.checked));
    if (c.dataset.set === 'appLock' && c.checked && !st().pinHash) { unlocked = false; render(); }
    if (c.dataset.set === 'healthReminders' && c.checked) S.save((s) => (s.lastHealthReminder = new Date().toISOString()));
    toast('Saved');
  }));
  document.getElementById('chpin')?.addEventListener('click', () => { S.save((s) => (s.pinHash = null)); unlocked = false; render(); });
  document.getElementById('notif').onclick = async () => {
    if (!('Notification' in window)) return toast('This browser has no notifications');
    const r = await Notification.requestPermission();
    toast(r === 'granted' ? 'Notifications on' : 'Notifications blocked');
  };
  document.getElementById('exp').onclick = () => {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  document.getElementById('wipe').onclick = async () => {
    if (!confirm('Delete EVERYTHING on this device? This cannot be undone.')) return;
    if (prompt('Type DELETE to confirm') !== 'DELETE') return;
    await S.wipeAll();
    unlocked = false;
    location.hash = '#/home';
    location.reload();
  };
});

route('appearance', () => {
  page(
    `${header('Appearance', '#/settings')}
    ${onlyMe('Only visible to you.')}
    <label>App theme<select id="th">${THEMES.map((t) => `<option ${t === set().appTheme ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <section class="theme-previews">${THEMES.map((t) => `<button class="tp" data-theme="${t.toLowerCase().replace(/\s+/g, '-')}" data-t="${t}"><span class="sw1"></span><span class="sw2"></span>${t}</button>`).join('')}</section>
    <label>Cartoon avatar style<select id="cs">${STYLES.map((t) => `<option ${t === set().cartoonAvatarStyle ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <div class="style-previews">${STYLES.map((s) => `<figure>${renderAvatar(DEFAULT_AVATAR, s)}<figcaption>${s}</figcaption></figure>`).join('')}</div>
    <p class="muted small">New style applies when you save an avatar.</p>`,
    'settings'
  );
  const setTheme = (t) => { S.save((s) => (s.settings.appTheme = t)); render(); };
  document.getElementById('th').onchange = (ev) => setTheme(ev.target.value);
  app.querySelectorAll('.tp').forEach((b) => (b.onclick = () => setTheme(b.dataset.t)));
  document.getElementById('cs').onchange = (ev) => { S.save((s) => (s.settings.cartoonAvatarStyle = ev.target.value)); toast('Saved'); };
});

// ---------- All set / Something went wrong ----------
route('done', () => {
  const d = JSON.parse(sessionStorage.getItem('bm.done') || '{"msg":"All set"}');
  page(`<div class="confirm-page"><div class="big-emoji">✅</div><h1>${e(d.msg)}</h1>${d.extra || ''}<a class="btn primary" href="#/roster">Back to roster</a><a class="btn ghost" href="#/home">Home</a></div>`, 'home');
});
route('oops', () => {
  const msg = sessionStorage.getItem('bm.err') || 'Something went wrong';
  page(`<div class="confirm-page"><div class="big-emoji">⚠️</div><h1>Something went wrong</h1><p>${e(msg)}</p><a class="btn primary" href="#/home">Try again</a></div>`, 'home');
});

// ---------- Reminders: prep start + health ----------
function tickReminders() {
  if (!st().onboarded) return;
  const now = Date.now();
  const due = L.prepStartTimes(allItems(now - L.HOUR, now + 2 * L.DAY), now).filter((x) => x.at <= now && !st().sentReminders.includes(x.id));
  if (due.length) {
    S.save((s) => { s.sentReminders.push(...due.map((x) => x.id)); s.sentReminders = s.sentReminders.slice(-200); });
    alertMe('Time to get ready');
  }
  if (set().healthReminders) {
    const last = +new Date(st().lastHealthReminder || 0);
    if (now - last > 90 * L.DAY) { S.save((s) => (s.lastHealthReminder = new Date().toISOString())); alertMe('Health check due'); }
  }
}

// ---------- boot ----------
window.addEventListener('hashchange', render);
render();
setInterval(tickReminders, 30 * 1000);
setTimeout(tickReminders, 3000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
