function luminance(hex) {
  const rgb=hex.slice(1).match(/../g).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
/** Contract: score(candidate, input) => Promise<Assessment>. No network or generation imports. */
export async function score(candidate, input) {
  const m=candidate.metadata;
  const a=luminance(m.foreground), b=luminance(m.background);
  const contrastRatio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  const contrast=Math.min(100,Math.round(contrastRatio/7*100));
  const brevity=Math.max(0,100-Math.max(0,m.textLength-15)*2);
  const font=Math.min(100,Math.round(m.fontSize/76*100));
  const overall=Math.round(contrast*.5+brevity*.3+font*.2);
  return {overall,kind:'layout_heuristic',version:'0.1.0',metrics:{contrast,brevity,font},reasons:[`配色のコントラスト比: ${contrastRatio.toFixed(1)}`,`タイトル ${m.textLength}文字・${m.lineCount}行`,...(m.textLength>30?['文字を短くした案も比較してください。']:[])],limitations:['画像内容・ジャンル適合は未評価。','CTR予測や効果保証ではありません。']};
}
