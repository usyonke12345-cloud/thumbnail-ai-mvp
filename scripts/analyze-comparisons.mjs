import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {partnerRows,summarizeReviews,csv,PREFERENCE_FIELDS,validateSet,splitFor} from '../frontend/comparison-model.js';
import {loadScoresSchema,summarizeAgreement} from '../data/agreement.mjs';
import {loadSchema} from '../data/validate.mjs';
// Use the partner's validators and analysis; keep all personal inputs under data/private/.
const [reportPath,bundlesDirectory]=process.argv.slice(2);
if(!reportPath||!bundlesDirectory)throw new Error('Usage: node scripts/analyze-comparisons.mjs report.json directory-with-image-bundles');
const report=JSON.parse(await readFile(resolve(reportPath),'utf8'));
if(report.version!==1||!Array.isArray(report.sets)||!Array.isArray(report.reviews))throw new Error('記録JSONの形式が不正です。');
const directory=resolve(bundlesDirectory),sets=[];
for(const reference of report.sets){if(!/^[a-zA-Z0-9-]{1,100}$/.test(reference.id))throw new Error('組IDの形式が不正です。');const set=validateSet(JSON.parse(await readFile(join(directory,`${reference.id}.json`),'utf8')));const {candidates,...header}=set;const stripped={...header,candidates:candidates.map(({imageDataUrl,...c})=>c)};if(JSON.stringify(stripped)!==JSON.stringify(reference))throw new Error('固定画像と記録のバージョン・採点が一致しません。');sets.push(set);}
for(const review of report.reviews){if(review.split!==await splitFor(review.sampleId))throw new Error('dev/holdoutがサンプルIDと一致しません。');}
const rows=partnerRows(report.reviews,sets),summary=summarizeReviews(report.reviews,sets);
if(summary.invalid.length)throw new Error('不正な評価記録があります。比較画面で確認してください。');
const agreement=summarizeAgreement(rows.preferences,rows.scores,await loadSchema(),await loadScoresSchema());
const output={summary,agreement,excluded:rows.excluded,note:'未評価の組み合わせが異なる候補は順位一致の集計から除外。全案不採用は別集計。画像付きJSONと人の評価は非公開で保管。'};
await writeFile(join(directory,'preferences.csv'),csv(PREFERENCE_FIELDS,rows.preferences),'utf8');
await writeFile(join(directory,'scores.csv'),csv(['candidate_id','style','overall','scoring_version'],rows.scores),'utf8');
await writeFile(join(directory,'analysis.json'),JSON.stringify(output,null,2),'utf8');
console.log(JSON.stringify({progress:summary.progress,reviews:summary.reviews,excluded:rows.excluded.length,generation:summary.generation,agreement:agreement.byVersion.map(({scoring_version,dev,holdout})=>({scoring_version,dev,holdout})),outputFiles:['preferences.csv','scores.csv','analysis.json']},null,2));
