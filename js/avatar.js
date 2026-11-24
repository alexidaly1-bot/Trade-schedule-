// Simple cartoon avatar made on the device. Always drawn fully clothed (head and shoulders only).

export const STYLES = ['Original Cartoon', 'Flat Pastel', 'Line Art', 'Comic Bold'];

export const OPTIONS = {
  skin: { Light: '#f6d3b8', Fair: '#e9b996', Medium: '#c98e66', Tan: '#a86f48', Brown: '#7d4f32', Deep: '#4f3121' },
  hair: ['Short', 'Buzz', 'Curly', 'Long', 'Swept', 'Bald'],
  hairColour: { Black: '#1d1a19', Brown: '#5b3a24', Blond: '#d8b25a', Ginger: '#b65a2a', Grey: '#9a9a9a', Pink: '#e78bb8' },
  facialHair: ['None', 'Stubble', 'Beard', 'Moustache'],
  glasses: ['No', 'Yes'],
  top: { Coral: '#E2805F', Navy: '#2c3e66', Green: '#3f7d5c', Black: '#222', White: '#f3f3f3', Purple: '#7a4fa3' },
  extra: ['None', 'Earring', 'Cap', 'Tattoo sleeve'],
};

export const DEFAULT_AVATAR = { skin: 'Medium', hair: 'Short', hairColour: 'Brown', facialHair: 'None', glasses: 'No', top: 'Coral', extra: 'None', custom: [] };

/** Guess avatar options from saved features (looks). */
export function fromFeatures(features) {
  const a = { ...DEFAULT_AVATAR };
  const t = features.map((f) => f.value.toLowerCase()).join(' ');
  if (/beard/.test(t)) a.facialHair = 'Beard';
  else if (/moustache|mustache/.test(t)) a.facialHair = 'Moustache';
  else if (/stubble/.test(t)) a.facialHair = 'Stubble';
  if (/glasses/.test(t)) a.glasses = 'Yes';
  if (/bald/.test(t)) a.hair = 'Bald';
  else if (/curly/.test(t)) a.hair = 'Curly';
  else if (/long hair/.test(t)) a.hair = 'Long';
  if (/blond/.test(t)) a.hairColour = 'Blond';
  else if (/ginger|red ?head/.test(t)) a.hairColour = 'Ginger';
  else if (/grey|gray|silver/.test(t)) a.hairColour = 'Grey';
  if (/tattoo/.test(t)) a.extra = 'Tattoo sleeve';
  return a;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderAvatar(opts, style = 'Original Cartoon', drawing = '') {
  const o = { ...DEFAULT_AVATAR, ...opts };
  const skin = OPTIONS.skin[o.skin] || OPTIONS.skin.Medium;
  const hairC = OPTIONS.hairColour[o.hairColour] || '#5b3a24';
  const top = OPTIONS.top[o.top] || '#E2805F';
  const line = style === 'Line Art' ? '#222' : style === 'Comic Bold' ? '#111' : 'rgba(0,0,0,.25)';
  const sw = style === 'Comic Bold' ? 4 : style === 'Line Art' ? 2.5 : 1.5;
  const fill = (c) => (style === 'Line Art' ? '#fff' : style === 'Flat Pastel' ? pastel(c) : c);
  const bg = style === 'Flat Pastel' ? '#f4ece6' : style === 'Line Art' ? '#fff' : style === 'Comic Bold' ? '#ffd76a' : '#2a2540';
  const S = `stroke="${line}" stroke-width="${sw}" stroke-linejoin="round"`;

  let hair = '';
  if (o.hair === 'Short') hair = `<path d="M62 78c0-30 18-44 38-44s38 14 38 44c-8-12-20-18-38-18s-30 6-38 18z" fill="${fill(hairC)}" ${S}/>`;
  if (o.hair === 'Buzz') hair = `<path d="M64 74c2-24 18-36 36-36s34 12 36 36c-10-8-22-12-36-12s-26 4-36 12z" fill="${fill(hairC)}" opacity=".85" ${S}/>`;
  if (o.hair === 'Curly') hair = [60, 72, 86, 100, 114, 128, 140].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 46 : 56}" r="14" fill="${fill(hairC)}" ${S}/>`).join('');
  if (o.hair === 'Long') hair = `<path d="M58 80c0-34 18-48 42-48s42 14 42 48v50h-14V82c-8-10-18-14-28-14s-20 4-28 14v48H58z" fill="${fill(hairC)}" ${S}/>`;
  if (o.hair === 'Swept') hair = `<path d="M60 80c-2-32 20-48 46-46 20 2 34 16 34 40-14-16-36-22-60-14-8 3-14 10-20 20z" fill="${fill(hairC)}" ${S}/>`;

  let face = '';
  if (o.facialHair === 'Beard') face = `<path d="M66 92c4 30 18 44 34 44s30-14 34-44c-8 10-20 14-34 14s-26-4-34-14z" fill="${fill(hairC)}" ${S}/>`;
  if (o.facialHair === 'Moustache') face = `<path d="M84 112c6-6 12-6 16-2 4-4 10-4 16 2-6 2-10 4-16 2-6 2-10 0-16-2z" fill="${fill(hairC)}"/>`;
  if (o.facialHair === 'Stubble') face = `<path d="M70 100c4 22 16 34 30 34s26-12 30-34" fill="none" stroke="${hairC}" stroke-width="10" stroke-dasharray="1 3" opacity=".5"/>`;

  const glasses = o.glasses === 'Yes' ? `<g fill="none" stroke="#222" stroke-width="3"><circle cx="86" cy="92" r="9"/><circle cx="114" cy="92" r="9"/><path d="M95 92h10"/></g>` : '';
  const extra = {
    Earring: `<circle cx="64" cy="106" r="3" fill="#ffd35a" stroke="#222"/>`,
    Cap: `<path d="M60 70c4-26 20-38 40-38s36 12 40 38zM120 66h32c0 6-8 10-20 10h-12z" fill="${fill(top)}" ${S}/>`,
    'Tattoo sleeve': `<path d="M40 180l10-26M44 186l14-28" stroke="#2c3e66" stroke-width="3" opacity=".7"/>`,
    None: '',
  }[o.extra] || '';
  const custom = (o.custom || []).slice(0, 3).map((c, i) => `<g><rect x="${8}" y="${8 + i * 22}" rx="9" width="${Math.min(150, 12 + c.length * 7)}" height="18" fill="#fff" opacity=".85"/><text x="14" y="${21 + i * 22}" font-size="11" font-family="system-ui" fill="#222">${esc(c)}</text></g>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Cartoon avatar">
<rect width="200" height="200" rx="28" fill="${bg}"/>
<path d="M30 200c4-40 30-58 70-58s66 18 70 58z" fill="${fill(top)}" ${S}/>
<path d="M86 132h28v16c-4 6-24 6-28 0z" fill="${fill(skin)}" ${S}/>
<ellipse cx="100" cy="92" rx="38" ry="44" fill="${fill(skin)}" ${S}/>
<ellipse cx="62" cy="96" rx="6" ry="9" fill="${fill(skin)}" ${S}/><ellipse cx="138" cy="96" rx="6" ry="9" fill="${fill(skin)}" ${S}/>
${hair}${face}
<circle cx="86" cy="92" r="4" fill="#222"/><circle cx="114" cy="92" r="4" fill="#222"/>
<path d="M88 116c6 6 18 6 24 0" fill="none" stroke="#222" stroke-width="3" stroke-linecap="round"/>
${glasses}${extra}
${drawing ? `<image href="${esc(drawing)}" x="0" y="0" width="200" height="200"/>` : ''}
${custom}
</svg>`;
}

function pastel(hex) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.45);
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}
