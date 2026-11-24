// Pure scheduling + parsing logic. No DOM, no storage. Tested in tests/logic.test.mjs.

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const overlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

/** Time the meet-up blocks out, including the private prep block before it. */
export function blockOf(m) {
  const s = +new Date(m.starts);
  const e = +new Date(m.ends);
  return { from: s - (Number(m.prepMinutes) || 0) * MIN, to: e };
}

/** Expand free times (one-off or weekly) into concrete windows between from..to. */
export function expandFree(freeTimes, from, to) {
  const out = [];
  for (const f of freeTimes) {
    const s = +new Date(f.starts);
    const e = +new Date(f.ends);
    if (f.repeats === 'weekly') {
      const len = e - s;
      let k = Math.max(0, Math.floor((from - e) / (7 * DAY)));
      for (let t = s + k * 7 * DAY; t < to; t += 7 * DAY) {
        if (t + len > from) out.push({ from: t, to: t + len });
      }
    } else if (e > from && s < to) {
      out.push({ from: s, to: e });
    }
  }
  out.sort((a, b) => a.from - b.from);
  // merge touching windows
  const merged = [];
  for (const w of out) {
    const last = merged[merged.length - 1];
    if (last && w.from <= last.to) last.to = Math.max(last.to, w.to);
    else merged.push({ ...w });
  }
  return merged;
}

/** Expand a partner routine into occurrences between from..to. */
export function expandRoutine(r, from, to) {
  const out = [];
  if (!r || !r.days || !r.days.length || !r.time) return out;
  const [hh, mm] = r.time.split(':').map(Number);
  const dur = (Number(r.durationMinutes) || 60) * MIN;
  const anchor = r.anchor ? new Date(r.anchor) : new Date(from);
  anchor.setHours(0, 0, 0, 0);
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  for (; +d < to; d.setDate(d.getDate() + 1)) {
    if (!r.days.includes(d.getDay())) continue;
    if (r.repeats === 'fortnightly') {
      const weeks = Math.floor((+d - +anchor) / (7 * DAY));
      if (((weeks % 2) + 2) % 2 !== 0) continue;
    }
    const s = new Date(d);
    s.setHours(hh, mm, 0, 0);
    if (+s + dur <= from || +s >= to) continue;
    out.push({
      id: `${r.id}:${s.toISOString()}`,
      routineId: r.id,
      person: r.person,
      starts: s.toISOString(),
      ends: new Date(+s + dur).toISOString(),
      prepMinutes: Number(r.prepMinutes) || 0,
      status: 'Planned',
      fromRoutine: true,
    });
  }
  return out;
}

/** Active (not cancelled) busy blocks, including prep. */
export function busyBlocks(meetups, ignoreId) {
  return meetups
    .filter((m) => m.status !== 'Cancelled' && m.id !== ignoreId)
    .map(blockOf);
}

/** Returns list of clashes for a candidate meet-up. */
export function clashes(candidate, meetups) {
  const b = blockOf(candidate);
  return meetups.filter((m) => {
    if (m.status === 'Cancelled' || m.id === candidate.id) return false;
    const o = blockOf(m);
    return overlap(b.from, b.to, o.from, o.to);
  });
}

/** "Enough prep time before it?" — prep must start in the future and nothing may clash. */
export function enoughPrep(candidate, meetups, now = Date.now()) {
  const b = blockOf(candidate);
  if (b.from < now) return { ok: false, reason: 'Not enough time to get ready before it starts.' };
  const c = clashes(candidate, meetups);
  if (c.length) return { ok: false, reason: 'It clashes with another plan or its prep time.' };
  return { ok: true };
}

/**
 * Find the next slot that fits [start-prep, start+duration] inside a free window
 * without touching other plans. Steps of 15 minutes.
 */
export function nextFreeSlot({ freeTimes, meetups, prepMinutes, durationMinutes, after = Date.now(), ignoreId, horizonDays = 28, gapMinutes = 0 }) {
  const prep = (Number(prepMinutes) || 0) * MIN;
  const dur = (Number(durationMinutes) || 60) * MIN;
  const gap = (Number(gapMinutes) || 0) * MIN;
  const busy = busyBlocks(meetups, ignoreId).map((b) => ({ from: b.from - gap, to: b.to + gap }));
  const windows = expandFree(freeTimes, after, after + horizonDays * DAY);
  const step = 15 * MIN;
  for (const w of windows) {
    let start = Math.max(w.from + prep, after + prep);
    start = Math.ceil(start / step) * step;
    for (; start + dur <= w.to; start += step) {
      const from = start - prep;
      const to = start + dur;
      if (from < w.from) continue;
      if (!busy.some((b) => overlap(from, to, b.from, b.to))) {
        return { starts: new Date(start).toISOString(), ends: new Date(to).toISOString() };
      }
    }
  }
  return null;
}

/** Plan several: fit each person into the next free slot, leaving gaps. Nothing is saved here. */
export function planSeveral({ people, count, freeTimes, meetups, defaultPrep, durationMinutes = 120, gapMinutes = 30, after = Date.now() }) {
  const plan = [];
  const working = [...meetups];
  const n = Math.max(1, Math.min(Number(count) || people.length || 1, 20));
  for (let i = 0; i < n; i++) {
    const p = people.length ? people[i % people.length] : null;
    const prep = p && p.usualPrepMinutes ? p.usualPrepMinutes : defaultPrep;
    const slot = nextFreeSlot({ freeTimes, meetups: working, prepMinutes: prep, durationMinutes, after, gapMinutes });
    if (!slot) break;
    const m = { id: `draft-${i}`, person: p ? p.id : null, place: '', prepMinutes: prep, status: 'Planned', ...slot };
    plan.push(m);
    working.push(m);
  }
  return plan;
}

/** Free/busy view for sharing — never includes names, places, counts or prep reasons. */
export function freeBusyView({ freeTimes, meetups, from = Date.now(), days = 14 }) {
  const to = from + days * DAY;
  const windows = expandFree(freeTimes, from, to);
  const busy = busyBlocks(meetups);
  const free = [];
  for (const w of windows) {
    // subtract busy blocks
    let parts = [{ ...w }];
    for (const b of busy) {
      const next = [];
      for (const p of parts) {
        if (!overlap(p.from, p.to, b.from, b.to)) { next.push(p); continue; }
        if (b.from > p.from) next.push({ from: p.from, to: b.from });
        if (b.to < p.to) next.push({ from: b.to, to: p.to });
      }
      parts = next;
    }
    for (const p of parts) if (p.to - p.from >= 30 * MIN) free.push([p.from, p.to]);
  }
  return free;
}

/** When prep needs to start, for reminders. */
export function prepStartTimes(items, now = Date.now(), lookaheadMs = 2 * DAY) {
  return items
    .filter((m) => m.status !== 'Cancelled')
    .map((m) => ({ id: m.id, at: blockOf(m).from, prep: Number(m.prepMinutes) || 0 }))
    .filter((x) => x.prep > 0 && x.at > now - 10 * MIN && x.at < now + lookaheadMs);
}

// ---------- Screenshot text reading ----------

const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseTime(str) {
  const m = str.match(/\b(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm)\b/i) || str.match(/\b([01]?\d|2[0-3])[:.](\d{2})\b/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, min, raw: m[0] };
}

function parseDay(str, now) {
  const s = str.toLowerCase();
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  if (/\btonight\b|\btoday\b/.test(s)) return { date: base, raw: 'today' };
  if (/\btomorrow\b|\btmrw\b|\btmr\b/.test(s)) return { date: new Date(+base + DAY), raw: 'tomorrow' };
  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`\\b(${WD[i]}|${WD[i].slice(0, 3)})\\b`);
    if (re.test(s)) {
      let diff = (i - base.getDay() + 7) % 7;
      if (diff === 0 && /next/.test(s)) diff = 7;
      return { date: new Date(+base + diff * DAY), raw: WD[i] };
    }
  }
  const dm = s.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/); // dd/mm (Australian)
  if (dm) {
    const d = Number(dm[1]);
    const mo = Number(dm[2]) - 1;
    let y = dm[3] ? Number(dm[3]) : base.getFullYear();
    if (y < 100) y += 2000;
    const date = new Date(y, mo, d);
    if (!isNaN(+date) && date.getMonth() === mo) return { date, raw: dm[0] };
  }
  return null;
}

const FEATURE_RULES = [
  ['Age', /\b(\d{2})\s*(?:yo|y\/o|yrs?|years?(?: old)?)\b/i, (m) => `${m[1]} years old`],
  ['Age', /\bage[:\s]+(\d{2})\b/i, (m) => `${m[1]} years old`],
  ['Looks', /\b(\d{3})\s?cm\b/i, (m) => `${m[1]} cm tall`],
  ['Looks', /\b(5|6)'\s?(\d{1,2})"?/, (m) => `${m[1]}'${m[2]}"`],
  ['Looks', /\b(tall|short|slim|skinny|stocky|muscly|muscular|athletic|chubby|cuddly|average build|toned)\b/i, (m) => m[1].toLowerCase()],
  ['Looks', /\b(beard|moustache|mustache|clean[- ]shaven|stubble|tattoos?|piercings?|glasses|bald|blond(?:e)?|brunette|red ?head|ginger|curly hair|long hair|short hair)\b/i, (m) => m[1].toLowerCase()],
  ['Demographic', /\b(?:i'?m|i am|from)\s+(?:from\s+)?([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/, (m) => `from ${m[1]}`],
  ['Demographic', /\b(?:work(?:s|ing)? (?:as|in)|i'?m an?)\s+([a-z]+(?: [a-z]+)?)\b/i, (m) => m[1].toLowerCase()],
  ['Interests', /\b(?:into|love|loves|like|likes|enjoy|enjoys)\s+([^.,!?\n]{3,40})/i, (m) => m[1].trim()],
  ['Qualities', /\b(funny|chill|shy|confident|kind|sweet|cheeky|polite|chatty|quiet|flirty|respectful|easygoing|laid[- ]back|nervous|direct)\b/i, (m) => m[1].toLowerCase()],
  ['Other', /\b(?:no|not into|don'?t|won'?t|never)\s+([^.,!?\n]{3,40})/i, (m) => `limit: ${m[0].trim()}`],
];

const STOP_NAMES = new Set(['I', 'Im', 'The', 'Ok', 'Okay', 'Yes', 'No', 'Hey', 'Hi', 'Hello', 'Sure', 'See', 'Sounds', 'Today', 'Tomorrow', 'Tonight', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Online', 'Active', 'Delivered', 'Read', 'Seen', 'Sent', 'Message', 'Type', 'Send', 'Cool', 'Great', 'Nice', 'Lol', 'Haha', 'What', 'When', 'Where', 'How', 'Can', 'Are', 'You']);

/** Pull names, date/time, place and details out of screenshot text. Everything unsure is flagged. */
export function parseScreenshotText(text, now = Date.now()) {
  const clean = (text || '').replace(/\r/g, '');
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const res = { person: '', personSure: false, when: null, whenSure: false, place: '', placeSure: false, features: [], unsure: [] };

  // Person: usually the chat header (first short line with a capitalised word)
  for (const l of lines.slice(0, 4)) {
    const m = l.match(/^([A-Z][a-zA-Z'-]{1,20})(?:\s[A-Z][a-zA-Z'-]{1,20})?(?:,?\s*\d{2})?$/);
    if (m && !STOP_NAMES.has(m[1])) { res.person = m[0].replace(/,?\s*\d{2}$/, ''); res.personSure = true; break; }
  }
  if (!res.person) {
    const m = clean.match(/\b(?:i'?m|my name'?s|it'?s|this is)\s+([A-Z][a-z]{2,15})\b/);
    if (m && !STOP_NAMES.has(m[1])) res.person = m[1];
  }
  if (!res.person) res.unsure.push('Could not find a name');
  else if (!res.personSure) res.unsure.push(`Name "${res.person}" is a guess`);

  // When: look for the last line mentioning both a day and a time, else any.
  let best = null;
  for (const l of lines) {
    const t = parseTime(l);
    const d = parseDay(l, now);
    if (t || d) best = { t: t || best?.t, d: d || best?.d, both: !!(t && d) };
  }
  if (best && (best.t || best.d)) {
    const date = best.d ? new Date(best.d.date) : new Date(now);
    if (!best.d) date.setHours(0, 0, 0, 0);
    if (best.t) date.setHours(best.t.h, best.t.min, 0, 0);
    else date.setHours(19, 0, 0, 0);
    if (!best.d && +date < now) date.setDate(date.getDate() + 1);
    res.when = date.toISOString();
    res.whenSure = !!(best.t && best.d);
    if (!res.whenSure) res.unsure.push(best.t ? 'Day is a guess' : 'Time is a guess (set to 7pm)');
  } else res.unsure.push('Could not find a date or time');

  // Place
  const pm = clean.match(/\b(?:at|@|meet (?:at|in)|in)\s+((?:my|your|the|[A-Z0-9])[^\n,.!?]{2,40})/);
  if (pm) {
    const place = pm[1].trim();
    if (!parseTime(place)) { res.place = place; res.placeSure = /^(my|your|the)\b/i.test(place) || /[A-Z]/.test(place[0]); }
  }
  if (!res.place) res.unsure.push('Could not find a place');

  // Features
  const seen = new Set();
  for (const l of lines) {
    for (const [category, re, fmt] of FEATURE_RULES) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = g.exec(l))) {
        const value = fmt(m);
        const key = `${category}:${value.toLowerCase()}`;
        if (seen.has(key) || value.length < 2) continue;
        seen.add(key);
        const sure = category === 'Age' || category === 'Looks';
        res.features.push({ category, value, source: 'screenshot', sure: sure ? 'yes' : 'unsure' });
      }
    }
  }
  return res;
}

/** Tag a typed note into a category (used by "Sort features into categories"). */
export function categorise(note) {
  for (const [category, re, fmt] of FEATURE_RULES) {
    const m = note.match(re);
    if (m) return { category, value: fmt(m), sure: 'unsure' };
  }
  return { category: 'Other', value: note.trim(), sure: 'unsure' };
}

const NICK_WORDS = {
  tall: ['Skyscraper', 'Big Tree', 'Tall Guy'], short: ['Pocket Rocket', 'Shorty'], beard: ['Beardo', 'Captain Beard', 'Fuzz'],
  tattoo: ['Ink', 'Inky', 'Sketchbook'], tattoos: ['Ink', 'Inky', 'Sketchbook'], glasses: ['Specs', 'Professor'], funny: ['Jester', 'Giggles'],
  chill: ['Cool Change', 'Chill Pill'], shy: ['Quiet One', 'Mouse'], cheeky: ['Trouble', 'Cheeky'], sweet: ['Honey', 'Sugar'],
  muscly: ['Muscles', 'Gym Rat'], muscular: ['Muscles', 'Gym Rat'], athletic: ['Sporty', 'Coach'], ginger: ['Rusty', 'Ginge'],
  'red head': ['Rusty', 'Ginge'], bald: ['Chrome Dome', 'Cue Ball'], blond: ['Goldie', 'Sunny'], blonde: ['Goldie', 'Sunny'], kind: ['Sweetheart', 'Gentle Giant'],
  confident: ['Boss', 'Big Deal'], chatty: ['Chatterbox', 'Radio'], quiet: ['Whisper', 'Ninja'],
};
const FALLBACK = ['Mr Tuesday', 'Night Owl', 'Mystery Man', 'Wildcard', 'The Regular', 'Lucky Dip', 'Sunshine'];

export function suggestNicknames(features, seed = 0) {
  const out = [];
  for (const f of features) {
    if (!['Qualities', 'Looks', 'Interests'].includes(f.category)) continue;
    const v = f.value.toLowerCase();
    for (const [k, names] of Object.entries(NICK_WORDS)) if (v.includes(k)) out.push(...names);
    if (f.category === 'Interests') {
      const w = v.split(/\s+/).find((x) => x.length > 3);
      if (w) out.push(`${w[0].toUpperCase()}${w.slice(1)} Fan`);
    }
  }
  for (let i = 0; out.length < 3; i++) out.push(FALLBACK[(seed + i) % FALLBACK.length]);
  return [...new Set(out)].slice(0, 5);
}

/** Insights: group features of a category across people. Only ever shown to the owner. */
export function insights(features, category) {
  const counts = {};
  for (const f of features) {
    if (f.category !== category) continue;
    const k = f.value.toLowerCase();
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// ---------- Share link encoding (no server: the free/busy data travels in the link) ----------

export function encodePayload(obj) {
  const json = JSON.stringify(obj);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodePayload(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}
