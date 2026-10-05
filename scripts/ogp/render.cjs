// card.html を 1200×630 の PNG（public/ogp.png）に書き出す。playwright はリポジトリに入れていないので、入っている場所を NODE_PATH で渡す。
//   NODE_PATH=<playwright の node_modules> node scripts/ogp/render.cjs
const path = require('path');
const { chromium } = require('playwright');

const HTML = 'file://' + path.join(__dirname, 'card.html');
const OUT = path.join(__dirname, '..', '..', 'public', 'ogp.png');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(HTML, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log('wrote', OUT);
})();
