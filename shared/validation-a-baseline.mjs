// Ordinary-user baseline from PR #11 (data/ab-compare.mjs chatgptPrompt).
// Deliberately exclude the service's internal people, material-edit and layout rules.
export const CHATGPT_BASELINE_VERSION='pr11-ordinary-short-1.0.0';
export function ordinaryChatgptPrompt(input,{sourcePhotoCount=1}={}){
 return [sourcePhotoCount===1?'この写真を使って、YouTube動画のサムネイル画像を作ってください。':`これら${sourcePhotoCount}枚の写真を使って、YouTube動画のサムネイル画像を作ってください。`,'横長（16:9）でお願いします。',`動画タイトル：「${input.title}」`,
  ...(input.brief?[`動画の内容：${input.brief}`]:[]),...(input.visualIntent?[`仕上がりのイメージ：${input.visualIntent}`]:[]),
  input.headlineMode==='manual'?`サムネイルに入れる文字：「${input.headline}」（この文字だけを入れてください）`:'動画タイトルをもとに、サムネイルに入れる短い見出しを考えて入れてください。',
  '写真の人物はそのまま使ってください。'].join('\n');
}
export function validationAProtocol(fixed){
 const sourcePhotoCount=1+(fixed.additionalSources?.length??0),ordinaryBaselineMatched=fixed.chatgptPrompt===ordinaryChatgptPrompt(fixed.input,{sourcePhotoCount});
 if(sourcePhotoCount>1)return {version:'validation-a-comparison-protocol-1.1.0',baselineVersion:null,comparison:'reference_multi_photo',ordinaryBaselineMatched,sourcePhotoCount,pr11SinglePhotoCompatible:false,pr11TitleLengthCompatible:[...fixed.input.title].length<=60,note:'複数写真の入力固定です。写真すべてと短い依頼文を保存します。PR #11の1枚写真の正式A比較とは別に条件を合意してください。'};
 return {version:'validation-a-comparison-protocol-1.0.0',baselineVersion:ordinaryBaselineMatched?CHATGPT_BASELINE_VERSION:null,
  comparison:ordinaryBaselineMatched?'service_vs_ordinary_chatgpt':'reference_other_prompt',ordinaryBaselineMatched,
  // PR #11 accepts titles of at most 60 code points; the app still supports 120.
  pr11TitleLengthCompatible:[...fixed.input.title].length<=60,
  note:ordinaryBaselineMatched?'短い通常依頼との製品比較の候補です。利用確認・初回性・盲検などは別に確かめます。':'以前の詳細指示などを使った参考記録です。通常の短い依頼との正式A比較には含めません。'};
}
