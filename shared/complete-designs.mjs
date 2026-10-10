// These are requested design recipes, never measurements of a generated PNG.
export const COMPLETE_DESIGNS=Object.freeze({
 photo_focus:Object.freeze({
  label:'写真を主役にする',fontLabel:'直立したすっきりしたサンセリフ',layoutLabel:'写真全面＋下部の短い見出し',fontClass:'design-sans',layoutClass:'design-bottom',
  typography:'Use upright humanist sans-serif lettering with straight baselines, open counters and medium weight, similar to Helvetica or Arial. Use Japanese Gothic letterforms for Japanese text. No italics, rounded bubble letters, comic lettering, brush strokes, exaggerated outlines or extruded 3D letters.',
  placement:'FULL-SCENE / BOTTOM CAPTION: keep the attached photographic scene full-bleed. Put a compact, left-aligned headline in the lower quarter, with about 5% inset from the frame edges. Keep the upper three quarters primarily photographic. Use only a subtle local dark gradient behind the words when needed; no separate portrait cut-out or large side panel.',
  treatment:'Keep the existing environmental context, perspective and natural photographic colors. Only crop or scale the whole photograph; do not isolate or relocate the person.'
 }),
 editorial:Object.freeze({
  label:'落ち着いた誌面風',fontLabel:'誌面風のセリフ／明朝',layoutLabel:'上部の見出し＋大きな写真',fontClass:'design-serif',layoutClass:'design-top',
  typography:'Use upright editorial serif lettering with visible serifs, moderate stroke contrast and regular or semibold weight, similar to Georgia. Use Japanese Mincho letterforms for Japanese text. Keep sturdy readable strokes; no italic, script, comic lettering, brush strokes, heavy outlines or extruded 3D letters.',
  placement:'EDITORIAL / TOP HEADLINE: place the headline in a compact upper strip, at most one quarter of the frame height, with about 5% edge insets. Keep the photograph dominant across the remaining frame, keeping the subject visible. Use a restrained off-white strip only if the upper photo has no unobstructed space. No lower caption, giant side billboard or cut-out portrait.',
  treatment:'Use a quiet editorial hierarchy and one compact text block. Preserve the actual photograph, pose and environment; do not replace the scene with a magazine collage.'
 }),
 impact:Object.freeze({
  label:'文字を大きく見せる',fontLabel:'直立した細長い太字サンセリフ',layoutLabel:'横の大きな見出し＋写真',fontClass:'design-condensed',layoutClass:'design-side',
  typography:'Use upright condensed sans-serif lettering with narrow straight-sided glyphs, a flat baseline and bold weight. Use condensed Japanese Gothic letterforms for Japanese text. Keep the letterforms visibly narrower and heavier than a regular humanist sans-serif. No italics, bubble letters, comic lettering, brush strokes or extruded 3D letters.',
  placement:'SIDE HEADLINE / TYPOGRAPHIC HIERARCHY: use a large stacked headline in unobstructed space on the left or right, opposite the actual subject in the photograph. Choose the side from the photograph instead of always moving the person right. Keep text within roughly 40% of the width and about 5% edge insets. Keep the photograph full-bleed; no top strip or lower caption, and no giant empty text panel.',
  treatment:'Create impact through type scale and narrow letterforms, not saturated colors, stickers or a relocated portrait. For quiet lifestyle content, keep the scene and palette calm even with a large headline.'
 })
});

const placements=Object.freeze({
 text_left:{label:'文字を左・主役を右',prompt:'Create a left-headline composition: place the headline in the left-side space and keep the existing subject visible toward the right through whole-photo cropping only.'},
 text_right:{label:'文字を右・主役を左',prompt:'Create a right-headline composition: place the headline in the right-side space and keep the existing subject visible toward the left through whole-photo cropping only.'},
 text_top:{label:'見出しを上・主役を大きく',prompt:'Create a top-headline composition: place the headline across the upper space while keeping the existing photographic subject visible below.'}
});
export function completeDesignInstructions(design='auto',composition='auto'){
 const recipe=COMPLETE_DESIGNS[design];
 if(design!=='auto'&&!recipe||composition!=='auto'&&!placements[composition])throw new Error('Unknown complete design or composition.');
 const override=placements[composition];
 const describe=(id,value)=>[
  `DESIGN RECIPE: ${id}`,
  `TYPOGRAPHY: ${value.typography}`,
  `LAYOUT: ${override?`${override.prompt} This explicit placement replaces the recipe's default headline zone. Do not also add a top strip or bottom caption.`:value.placement}`,
  `PHOTOGRAPH: ${value.treatment}`
 ].join('\n');
 return recipe?describe(design,recipe):[
  'Inspect the attached photograph and choose a composition that suits its actual subjects and video context.',
  'Choose exactly ONE of the following design recipes and follow its typography and layout together. Do not blend the three recipes or merely change the colors.',
  ...Object.entries(COMPLETE_DESIGNS).map(([id,value])=>describe(id,value))
 ].join('\n');
}
export function completeDesignSummary(design='auto',composition='auto'){
 const recipe=COMPLETE_DESIGNS[design],override=placements[composition];
 return recipe?`${recipe.fontLabel}。配置の希望：${override?.label??recipe.layoutLabel}。${override?'構図を固定しています。配置も変える場合は「写真と内容に合わせてAIが決める」を選んでください。':''}`:
  `同じ入力の保存済み履歴から、下部・上部・横の見出しと字体を組み合わせた次の方向を選びます。${override?'構図を固定しているため、見出しの位置はこの指定を優先します。':''}`;
}
