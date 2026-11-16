// Pulls profile details and a suggested meet-up time out of free text
// (pasted chat, or text read from a screenshot by OCR).
// Pure functions only, so it can be tested in Node.

const APPS = ['grindr', 'scruff', 'tinder', 'hinge', 'sniffies', "jack'd", 'jackd', 'hornet', 'romeo', 'squirt', 'bumble', 'her', 'feeld', 'whatsapp', 'telegram', 'instagram', 'snapchat', 'signal'];
const POSITIONS = [
  ['vers top', /\bvers(?:atile)?[\s-]*top\b/i],
  ['vers bottom', /\bvers(?:atile)?[\s-]*(?:bottom|btm)\b/i],
  ['vers', /\bvers(?:atile)?\b/i],
  ['top', /\btop\b/i],
  ['bottom', /\b(?:bottom|btm)\b/i],
  ['side', /\bside\b/i],
];
const BODY = ['slim', 'toned', 'average', 'muscular', 'stocky', 'large', 'athletic', 'fit', 'chubby', 'dad bod', 'built', 'lean', 'hairy', 'smooth'];
const TRIBES = ['bear', 'cub', 'otter', 'wolf', 'jock', 'twink', 'daddy', 'clean-cut', 'geek', 'leather', 'rugged', 'trans', 'discreet', 'poz', 'sober', 'pup', 'muscle', 'masc', 'femme', 'bi', 'straight', 'married', 'dl'];
const ETHNICITY = ['asian', 'black', 'latino', 'latin', 'middle eastern', 'mixed', 'native american', 'white', 'caucasian', 'south asian', 'indian', 'pacific islander', 'aboriginal', 'maori', 'european', 'mediterranean', 'arab', 'filipino', 'chinese', 'vietnamese', 'thai', 'korean', 'japanese', 'lebanese', 'greek', 'italian', 'brazilian'];
const LOOKING = ['chat', 'dates', 'friends', 'networking', 'relationship', 'right now', 'hookups', 'hook ups', 'fun', 'fwb', 'nsa', 'casual', 'mates'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const LABELS = {
  name: /^(?:name|display name|nickname)\s*[:\-–]\s*(.+)$/i,
  location: /^(?:location|suburb|area|from|lives in|based in)\s*[:\-–]\s*(.+)$/i,
  address: /^(?:address|addy|addr)\s*[:\-–]\s*(.+)$/i,
  age: /^age\s*[:\-–]\s*(\d{2})/i,
  status: /^(?:hiv status|status)\s*[:\-–]\s*(.+)$/i,
  tested: /^(?:last tested|tested)\s*[:\-–]\s*(.+)$/i,
  about: /^(?:about( me)?|bio)\s*[:\-–]\s*(.+)$/i,
};

function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }
function wordFind(text, list) {
  const lower = ' ' + text.toLowerCase().replace(/[^a-z0-9'-]+/g, ' ') + ' ';
  return list.filter(w => lower.includes(' ' + w + ' ') || lower.includes(' ' + w + 's '));
}
function cap(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }

export function parseProfile(raw) {
  const text = (raw || '').replace(/\r/g, '');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = {};

  // Labelled lines first ("Name: Jake")
  for (const line of lines) {
    for (const [key, re] of Object.entries(LABELS)) {
      const m = line.match(re);
      if (m && !out[key]) out[key] = (m[2] || m[1]).trim();
    }
  }

  // Age: "32 yo", "32y", "32 years", or the "32 · 180 cm" Grindr stat line
  if (!out.age) {
    const m = text.match(/\b([1-7]\d)\s*(?:yo|y\/o|y\.o\.|yrs?|years?(?: old)?)\b/i)
      || text.match(/\b([1-7]\d)\s*[^\w\s]?\s*\d{3}\s*cm/i)
      || text.match(/\b([1-7]\d)\s*[·•|,\/]\s*\d['’]/);
    if (m && +m[1] >= 18) out.age = m[1];
  }

  if (!out.location) {
    const lm = text.match(/\b(?:host(?:ing)?|live|living|based|staying|i'?m|im)\s+in\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
    if (lm) out.location = lm[1];
  }

  // Height
  let m = text.match(/\b(1\d{2}|2[0-2]\d)\s?cm\b/i);
  if (m) out.height = m[1] + ' cm';
  else if ((m = text.match(/\b([4-7])\s?['’]\s?(\d{1,2})?\s?(?:["”]|'')?/))) out.height = m[1] + "'" + (m[2] || '0') + '"';

  // Weight
  m = text.match(/\b(\d{2,3})\s?kgs?\b/i);
  if (m) out.weight = m[1] + ' kg';
  else if ((m = text.match(/\b(\d{2,3})\s?(?:lbs?|pounds)\b/i))) out.weight = m[1] + ' lb';

  // Distance
  m = text.match(/\b(\d+(?:[.,]\d+)?)\s?(km|kms|m|metres|meters|mi)\s+away\b/i)
    || text.match(/\b(\d+(?:[.,]\d+)?)\s?(km|kms)\b/i);
  if (m) out.distance = m[1].replace(',', '.') + ' ' + m[2].toLowerCase().replace(/^kms$/, 'km').replace(/^(metres|meters)$/, 'm') + ' away';

  // Profile tags live on short lines; long chat sentences give false hits
  const plain = lines.filter(l => l.split(/\s+/).length <= 6).join('\n').replace(/\S*@\S+/g, ' ');

  // Position
  for (const [label, re] of POSITIONS) { if (re.test(plain)) { out.position = label; break; } }

  const body = wordFind(plain, BODY); if (body.length) out.body = body.map(cap).join(', ');
  const tribes = wordFind(plain, TRIBES); if (tribes.length) out.tribes = tribes.map(cap);
  const eth = wordFind(plain, ETHNICITY); if (eth.length) out.ethnicity = cap(eth[0]);
  const look = wordFind(plain, LOOKING); if (look.length) out.lookingFor = uniq(look.map(l => l.replace('hook ups', 'hookups'))).map(cap);
  const apps = wordFind(plain, APPS); if (apps.length) out.app = cap(apps[0].replace('jackd', "jack'd"));

  // Sexual health
  if (!out.status) {
    if (/undetectable|u\s?=\s?u/i.test(text)) out.status = 'Positive, undetectable';
    else if (/neg(?:ative)?[,\s]*(?:on\s)?prep/i.test(text)) out.status = 'Negative, on PrEP';
    else if (/\bhiv\s?neg|\bneg(?:ative)?\b/i.test(text)) out.status = 'Negative';
    else if (/\bhiv\s?pos|\bpoz\b|\bpositive\b/i.test(text)) out.status = 'Positive';
  }
  if (/\bprep\b/i.test(text)) out.prep = true;
  if (!out.tested) {
    m = text.match(/(?:last\s)?tested\s*(?:on|in)?\s*[:\-]?\s*([a-z]{3,9}\.?\s?\d{2,4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d+\s(?:days?|weeks?|months?)\sago)/i);
    if (m) out.tested = m[1];
  }

  // Hosting
  if (/can(?:'|’)?t host|cannot host|no host|need (?:a )?host/i.test(text)) out.hosting = "Can't host";
  else if (/can host|hosting|i host|at mine|my place/i.test(text)) out.hosting = 'Can host';
  else if (/can travel|will travel|i travel|come to you|your place/i.test(text)) out.hosting = 'Travels';

  // Contacts
  m = text.match(/(?:\+?61\s?4|\b04)\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/);
  if (m) out.phone = m[0].replace(/[\s-]/g, '').replace(/^\+?614/, '04');
  m = text.match(/(?:^|\s)@([a-z0-9._]{3,30})\b/i);
  if (m) out.handle = '@' + m[1];

  // Street address (e.g. "12 Smith St, Concord")
  if (!out.address) {
    m = text.match(/\b(?:unit\s?\d+[\/,]?\s?)?\d{1,4}[a-z]?\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s(?:St|Street|Rd|Road|Ave|Avenue|Pde|Parade|Cres|Crescent|Dr|Drive|Pl|Place|Ln|Lane|Hwy|Way|Ct|Court|Tce|Terrace)\b[^\n]{0,30}/);
    if (m) out.address = m[0].trim();
  }

  // Name: first short line that looks like a name and isn't a stat line
  if (!out.name) {
    const skip = /\d|cm|kg|away|online|ago|active|message|chat|tap|now|profile|grindr|scruff|tinder|photos?|block|report|favourite|about|looking|status|tribe|position|height|weight|body|ethnic|relationship|accept|nsfw|today|yesterday|send|reply|type|hey|hi\b|hello|sup\b|yo\b|\btop\b|bottom|vers|toned|slim|muscular|stocky|average|stats|delivered|seen|say something|\byou\b|\b(?:which|what|the|and|one|yes|yeah|no|nah|lol|haha|ok|okay|sure|thanks|cool|nice|wow|omg|same|true|why|how|when|where|who|is|are|was|it|that|this|me|my)\b|\?|!/i;
    for (const line of lines.slice(0, 6)) {
      const clean = line.replace(/[^\p{L}\p{Emoji_Presentation}\s.'’-]/gu, '').trim();
      if (clean.length >= 2 && clean.length <= 24 && clean.split(/\s+/).length <= 3 && /\p{L}{3,}/u.test(clean) && !skip.test(line) && /\p{Lu}/u.test(clean[0])) {
        out.name = clean; break;
      }
    }
  }

  const when = parseWhen(text);
  if (when) out.when = when.toISOString();
  return out;
}

// Finds a meet-up time like "tonight 9", "tomorrow at 7:30pm", "fri 8pm", "18/11 6pm".
export function parseWhen(text, now = new Date()) {
  // ignore chat timestamps, the phone status bar and "online x ago" lines
  const t = (text || '').split('\n')
    .filter(l => !/^\s*(?:\d{1,2}(?::\d{2})?\s?(?:am|pm)?|\d{1,2}:\d{2}|delivered.*|seen.*|read.*|\d{1,2}:\d{2}\s+\w{3},?\s+\d{1,2}\s+\w{3}.*|.*\bago\b.*)\s*$/i.test(l))
    .join('\n').toLowerCase();
  let day = null;
  const base = new Date(now); base.setSeconds(0, 0);

  const nowish = /\b(?:(?:come|free|over|horny|keen)\s(?:right\s)?now|asap|rn)\b/.test(t);
  if (/\b(tonight|tonite|today|this arvo|this afternoon|this evening)\b/.test(t) || nowish) day = new Date(base);
  if (/\b(tomorrow|tmrw|tmr|tomoz)\b/.test(t)) { day = new Date(base); day.setDate(day.getDate() + 1); }
  let m = t.match(/\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|sday|nesday|rsday|urday)?\b/);
  if (m && !day) {
    const idx = DAYS.findIndex(d => d.startsWith(m[1].slice(0, 3)));
    day = new Date(base);
    let diff = (idx - day.getDay() + 7) % 7;
    if (/\bnext\s/.test(t.slice(Math.max(0, m.index - 6), m.index))) diff = diff || 7;
    day.setDate(day.getDate() + diff);
  }
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m && !day && +m[2] <= 12 && +m[1] <= 31) {
    day = new Date(base); day.setMonth(+m[2] - 1, +m[1]);
    if (day < base && !m[3]) day.setFullYear(day.getFullYear() + 1);
  }
  m = t.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s(' + MONTHS.join('|') + ')[a-z]*\\b'));
  if (m && !day) { day = new Date(base); day.setMonth(MONTHS.indexOf(m[2]), +m[1]); if (day < base) day.setFullYear(day.getFullYear() + 1); }

  // Time
  let hour = null, min = 0;
  m = t.match(/\b(\d{1,2}):(\d{2})\s?(am|pm)?\b/) || t.match(/\b(\d{1,2})\.(\d{2})\s?(am|pm)\b/) || t.match(/\b(\d{1,2})\s?(am|pm)\b/);
  if (m) {
    hour = +m[1];
    const mer = m[3] || (m[2] && /am|pm/.test(m[2]) ? m[2] : null);
    if (m[2] && /^\d{2}$/.test(m[2])) min = +m[2];
    if (mer === 'pm' && hour < 12) hour += 12;
    if (mer === 'am' && hour === 12) hour = 0;
    if (!mer && hour >= 1 && hour <= 11) hour += 12; // "at 9" for a hook-up almost always means evening
  } else {
    m = t.match(/\b(?:at|@|around|bout|about|by|tonight|tomorrow|tmrw|tmr|tonite|day|arvo)\s?(\d{1,2})\b(?!\s?(?:km|m\b|cm|kg|min|hr|yo|y\b|\/))/);
    if (m && +m[1] <= 23) { hour = +m[1]; if (hour >= 1 && hour <= 11) hour += 12; }
  }
  if (hour === null && /\b(tonight|this evening)\b/.test(t)) hour = 20;
  if (hour === null && /\b(this arvo|this afternoon)\b/.test(t)) hour = 15;
  if (hour === null && nowish) { hour = base.getHours() + 1; }
  if (hour === null && day && /\barvo|afternoon\b/.test(t)) hour = 15;
  if (hour === null && day && /\bmorning|brekkie\b/.test(t)) hour = 9;
  if (hour === null && day) hour = 19;
  if (hour === null || hour > 23 || min > 59) return null;
  if (!day) { day = new Date(base); }
  day.setHours(hour, Math.round(min / 15) * 15, 0, 0);
  if (day < base && !/\d[\/.]\d|\d\s(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(t)) day.setDate(day.getDate() + 1);
  return day;
}

// Merges newly parsed info into an existing profile without wiping what's there.
export function mergeProfile(profile, found) {
  const p = { ...profile };
  for (const [k, v] of Object.entries(found)) {
    if (k === 'when' || v === undefined || v === '' || v === null) continue;
    if (Array.isArray(v)) p[k] = uniq([...(p[k] || []), ...v]);
    else if (!p[k]) p[k] = v;
  }
  return p;
}
