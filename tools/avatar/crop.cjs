// Usage: node crop.cjs <outDir> <image> [image...]
// Finds the person in each screenshot and saves a crop of just them.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const [outDir, ...files] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.join(__dirname, 'crop.html'));
  await p.waitForFunction(() => window.ready);
  const report = [];
  for (const f of files) {
    const mime = f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const src = `data:${mime};base64,` + fs.readFileSync(f).toString('base64');
    const r = await p.evaluate((s) => window.safeCrop(s), src);
    const name = path.basename(f).replace(/\.\w+$/, '') + '-person.jpg';
    if (r.ok) fs.writeFileSync(path.join(outDir, name), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    report.push({ file: path.basename(f), found: r.ok, score: r.score && +r.score.toFixed(2), areaFrac: r.areaFrac && +r.areaFrac.toFixed(2), cut: r.how, cutFrac: r.cutFrac, out: r.ok ? name : null });
  }
  console.log(JSON.stringify(report, null, 1));
  await b.close();
})();
