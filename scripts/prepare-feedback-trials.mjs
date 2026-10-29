import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareFeedbackTrials,trialItems,publicTrialItems,trialCsv} from '../backend/analysis/feedback-trials.mjs';
import {reviewItems,sheetHtml,sheetCsv} from '../data/complete-review-sheet.mjs';
const [dir,reviewer,out,...args]=process.argv.slice(2);if(!dir||!reviewer||!out||args.length!==0&&(args.length!==2||args[0]!=='--generation-version'))throw new Error('Usage: node scripts/prepare-feedback-trials.mjs private-analysis-directory r01 data/private/blind-r01 [--generation-version ai-complete-0.10.2]');
const options=args.length?{generationVersion:args[1]}:{};
const input=resolve(dir),output=resolve(out),privateRoot=fileURLToPath(new URL('../data/private/',import.meta.url)),rel=relative(privateRoot,output);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('評価条件を含むため、出力先はdata/private/の新しい子フォルダーにしてください。');
const dataset=JSON.parse(await readFile(join(input,'analysis.json'),'utf8')),plan=prepareFeedbackTrials(dataset,reviewer,options),items=trialItems(dataset,plan,reviewItems),assets=new Map();
const publicItems=publicTrialItems(plan,items),answerKey={...plan,itemMap:items.map(x=>({trialId:x.trialId,imageId:x.imageId,groupId:x.groupId}))};
for(const item of items)for(const sha of [item.sourceSha,item.imageSha]){if(!/^[a-f0-9]{64}$/.test(sha))throw new Error('Invalid image hash');if(assets.has(sha))continue;const bytes=await readFile(join(input,'assets',sha+'.png'));if(createHash('sha256').update(bytes).digest('hex')!==sha)throw new Error('Image SHA-256 mismatch');assets.set(sha,'data:image/png;base64,'+bytes.toString('base64'));}
// Reserve a fresh directory before writing any file; an existing answer sheet is never touched.
await mkdir(dirname(output),{recursive:true});
try{await mkdir(output);}catch(error){if(error.code==='EEXIST')throw new Error('出力先は既にあります。記入済みの記録を保つため、新しいフォルダー名を指定してください。');throw error;}
for(const [name,body]of [['private-answer-key.json',JSON.stringify(answerKey,null,2)],['photo-review.html',sheetHtml(publicItems,reviewer,sha=>assets.get(sha))],['photo-review.csv',sheetCsv(publicItems,reviewer)],['pair-choices.csv',trialCsv(plan,items)],['README.txt','評価者へはphoto-review.html、photo-review.csv、pair-choices.csvだけを渡す。private-answer-key.jsonは運営側で保管し、判断を保存してから条件を照合する。公開する記録表の画像ID・組IDはp番号・b番号に置き換え、元IDとの対応も非公開のキーで保管する。preferredにはA/B/tie/neither、reasonには本人の理由を記入。条件を伏せても作者自身は見た目を覚えている可能性があるため、作成に立ち会わなかった人へ依頼する。0組なら有効な対照がまだ無く、評価は未実施。API送信や生成は行わない。写真を含むため非公開で扱う。']])await writeFile(join(output,name),body,{flag:'wx'});
console.log(JSON.stringify({pairs:plan.pairs.length,excluded:plan.excluded.length,generationVersion:plan.generationVersion,generatedImages:0,output}));
