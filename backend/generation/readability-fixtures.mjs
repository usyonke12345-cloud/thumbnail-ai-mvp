import { mkdir, writeFile } from 'node:fs/promises';
// Artificial comparison only. No API, scoring, or production contract changes.
const out = new URL('../../docs/readability/', import.meta.url);
await mkdir(out, { recursive: true });
const title = '初心者のための動画制作';
const sizes = [48, 60, 76];
const widths = [168, 246, 360];
const files = [];
for (const fontSize of sizes) {
  const file = `synthetic-01-${fontSize}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#cbd5e1"/><rect x="48" y="120" width="1120" height="460" rx="24" fill="#172554"/><text x="80" y="350" font-family="sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff">${title}</text></svg>`;
  await writeFile(new URL(file, out), svg);
  files.push({ file, fontSize });
}
await writeFile(new URL('manifest.json', out), JSON.stringify({ setId: 'synthetic-01', source: 'synthetic', title, generationVersion: 'readability-fixture-0.1.0', canvas: { width: 1280, height: 720 }, variable: 'fontSize', fontFamily: 'sans-serif', fontWeight: 800, provisionalDisplayWidths: widths, variants: files, limitations: ['人工データ。許諾済み20タイトルには数えない。', '表示幅とフォント基準は未検証。', 'sans-serifはOSにより異なる。比較は同じPC・ブラウザ・ズーム100%で行い、実際のフォントを記録する。', '本番の文字パネルとは異なる検証用配置。'] }, null, 2) + '\n');
await writeFile(new URL('index.html', out), `<!doctype html><html lang="ja"><meta charset="utf-8"><title>文字サイズ比較・人工画像</title><style>body{font-family:sans-serif;margin:24px;color:#172554}section{margin:32px 0}.row{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}img{display:block;max-width:none}figcaption{margin-top:8px}</style><h1>同じタイトル・文字サイズだけの比較</h1><p>人工タイトル：${title}。168 / 246 / 360pxは仮の表示幅です。ブラウザのズーム100%で確認してください。</p><p>各組は背景・色・位置・太さ・フォント指定を固定し、文字サイズだけ48 / 60 / 76pxに変更しています。採点や効果の保証はありません。</p>${widths.map(width => `<section><h2>表示幅 ${width}px（仮）</h2><div class="row">${files.map(({file,fontSize}) => `<figure><img src="${file}" width="${width}" height="${width * 720 / 1280}" alt="${title}・${fontSize}px"><figcaption>${fontSize}px → 表示時 ${fontSize * width / 1280}px<br><a href="${file}" download>SVG保存</a></figcaption></figure>`).join('')}</div></section>`).join('')}<p>記録：setId、表示幅、文字サイズ、読めたか、確認時間、理由、OS、ブラウザ、実際のフォント、ズーム。manifest.jsonに生成条件を保存しています。</p></html>`);
console.log('Created docs/readability/index.html, manifest.json and three SVGs (no API calls).');
