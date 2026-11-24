// Reads text from screenshots on this device using Tesseract.js (loaded only when needed).
// The images never leave the device; only the OCR engine + English language data are downloaded once.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let loading;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!loading) {
    loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = () => res(window.Tesseract);
      s.onerror = () => rej(new Error('Could not load the screenshot reader. Check your internet once, then it works offline.'));
      document.head.appendChild(s);
    });
  }
  return loading;
}

export async function readImages(files, onProgress = () => {}) {
  const out = [];
  let T;
  try {
    T = await loadTesseract();
  } catch (err) {
    return files.map((file) => ({ file, text: '', error: err.message }));
  }
  const worker = await T.createWorker('eng');
  try {
    for (let i = 0; i < files.length; i++) {
      onProgress(`Reading ${i + 1} of ${files.length}…`);
      try {
        const { data } = await worker.recognize(files[i]);
        out.push({ file: files[i], text: data.text || '' });
      } catch (err) {
        out.push({ file: files[i], text: '', error: err.message });
      }
    }
  } finally {
    await worker.terminate();
  }
  onProgress('Done');
  return out;
}
