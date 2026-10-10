import {open,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {completePreview} from '../backend/analysis/complete-preview.mjs';

const args=process.argv.slice(2),outIndex=args.indexOf('--out');
let output=resolve(fileURLToPath(new URL('../data/private/complete-analysis/',import.meta.url)));
if(outIndex>=0){if(!args[outIndex+1])throw new Error('--out の保存先が必要です。');output=resolve(args[outIndex+1]);args.splice(outIndex,2);}
if(!args.length)throw new Error('Usage: node scripts/analyze-complete-comparisons.mjs [--out private-directory] report.json [report2.json ...]');
const outputFiles=['preview.html','analysis.json','human-reviews.jsonl','assets/','README.txt'];
const inputPaths=new Set(args.map(x=>resolve(x).toLowerCase()));
if(outputFiles.some(file=>inputPaths.has(join(output,file).toLowerCase())))throw new Error('入力ファイルと出力ファイルを同じにできません。');
// An explicit output directory may be used for private transfer or isolated tests.
await mkdir(join(output,'assets'),{recursive:true});const written=new Set();
const analysis=createCompleteReviewAnalysis({async onAsset(asset,bytes){if(written.has(asset.sha256))return;const path=join(output,asset.path);if(inputPaths.has(path.toLowerCase()))throw new Error('入力ファイルと画像出力を同じにできません。');await writeFile(path,bytes);written.add(asset.sha256);}});
for(const input of args){
 const path=resolve(input),handle=await open(path,'r');let report;
 try{const stat=await handle.stat();if(!stat.isFile()||stat.size>70*1024*1024)throw new Error('比較JSONは1ファイル70MiB以下にしてください。');report=JSON.parse(await handle.readFile({encoding:'utf8'}));}finally{await handle.close();}
 const sets=report.kind==='human_quality_review'?[report]:report.version==='complete-comparison-report-1.0.0'&&report.kind==='human_quality_report'&&report.assessment===null&&Array.isArray(report.sets)?report.sets:null;
 if(!sets||sets.length<1||sets.length>6)throw new Error('完成PNGの比較JSONが必要です（1ファイル最大6組）。');
 for(const bundle of sets)await analysis.consume(bundle);
}
const result=analysis.finish();
await writeFile(join(output,'analysis.json'),JSON.stringify(result,null,2),'utf8');
await writeFile(join(output,'human-reviews.jsonl'),result.reviews.map(x=>JSON.stringify(x)).join('\n')+'\n','utf8');
await writeFile(join(output,'preview.html'),completePreview(result),'utf8');
const sourceNote='完成PNGの品質採点・CTR予測・採点との順位一致は未実装。許諾と人の選択は実際の記録だけを使用。';
await writeFile(join(output,'README.txt'),`${sourceNote}\npreview.html: ブラウザで元写真・完成PNG・保存された人のコメントを見比べる。フォルダー全体を展開してから開く。追加のAPI通信・比較記録はない。\nanalysis.json: 画像資産の相対パス、診断結果、入力条件、人の選択、実費、進み具合。\nassets/: SHA-256で名前を固定したPNG。\nhuman-reviews.jsonl: 人の比較記録。\nこのフォルダー全体を非公開で採点担当へ渡してください。実データをGitへ入れないでください。\n`,'utf8');
console.log(JSON.stringify({images:result.images.length,assets:result.assets.length,analyzedAssets:result.assets.filter(x=>x.diagnostic.status==='analyzed').length,progress:{target:20,completedHumanComparisons:result.progress.completedHumanComparisons,authorizedRealComparisons:result.progress.authorizedRealComparisons,pending:result.progress.pending.length},outputFiles,scoringAgreement:null},null,2));
