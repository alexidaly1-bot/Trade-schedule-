// Finds the person in a picture and crops to them, cut ABOVE THE HIPS so nothing
// below the waist ever leaves the phone. Runs fully on the device; the small AI
// models (~6 MB) download once from a CDN.
const LIBS = [
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/posenet@2.2.2/dist/posenet.min.js',
];
const WORK = 512; // analyse a small copy; crop the full-size original
let libsP, detP, poseP;

function load(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the person finder (offline?)'));
    document.head.appendChild(s);
  });
}
async function libs() {
  if (!libsP) libsP = (async () => { for (const l of LIBS) await load(l); })();
  return libsP;
}
async function detector() { await libs(); return detP ||= window.cocoSsd.load({ base: 'lite_mobilenet_v2' }); }
async function poser() { await libs(); return poseP ||= window.posenet.load({ architecture: 'MobileNetV1', outputStride: 16, inputResolution: 257, multiplier: 0.75 }); }

// Start downloading/warming the models early (e.g. when the Cartoon screen opens).
export function warmUp() { detector().catch(() => {}); poser().catch(() => {}); }

async function toImg(blob) {
  const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); return img;
}
function canvasOf(src, x, y, w, h, scale = 1) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
  c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

// -> { ok, blob, how } ; ok=false when no person is found
export async function safeCrop(blob) {
  const img = await toImg(blob);
  const W = img.naturalWidth, H = img.naturalHeight;
  const s = Math.min(1, WORK / Math.max(W, H));
  const small = canvasOf(img, 0, 0, W, H, s);
  const people = (await (await detector()).detect(small, 10, 0.3)).filter(p => p.class === 'person');
  if (!people.length) { URL.revokeObjectURL(img.src); return { ok: false }; }
  people.sort((a, b) => b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3]);
  let [x, y, w, h] = people[0].bbox.map(v => v / s); // back to full size
  const pad = 0.06;
  x = Math.max(0, x - w * pad); y = Math.max(0, y - h * pad);
  w = Math.min(W - x, w * (1 + 2 * pad)); h = Math.min(H - y, h * (1 + 2 * pad));

  const ps = Math.min(1, WORK / Math.max(w, h));
  const personSmall = canvasOf(img, x, y, w, h, ps);
  const pose = await (await poser()).estimateSinglePose(personSmall, { flipHorizontal: false });
  const kp = Object.fromEntries(pose.keypoints.map(k => [k.part, k]));
  const seen = (k) => kp[k] && kp[k].score > 0.3;
  const hips = ['leftHip', 'rightHip'].filter(seen).map(k => kp[k].position.y / ps);
  const sh = ['leftShoulder', 'rightShoulder'].filter(seen).map(k => ({ x: kp[k].position.x / ps, y: kp[k].position.y / ps }));
  let line, how;
  if (hips.length) { line = Math.min(...hips) - h * 0.03; how = 'hips'; }
  else if (sh.length === 2) { line = Math.max(sh[0].y, sh[1].y) + Math.abs(sh[0].x - sh[1].x); how = 'shoulders'; }
  else { line = h * 0.45; how = 'fallback'; }
  line = Math.max(h * 0.2, Math.min(line, h * 0.6)); // never lower than 60% of the person
  const outScale = Math.min(1, 1200 / Math.max(w, line));
  const top = canvasOf(img, x, y, w, line, outScale);
  const out = await new Promise(r => top.toBlob(r, 'image/jpeg', 0.9));
  URL.revokeObjectURL(img.src);
  return { ok: true, blob: out, how };
}
