// These are requested directions and experimental ideas, never measured or approved PNGs.
export const MAX_VISUAL_INTENT_LENGTH=300;
export function normalizeVisualIntent(value){
 if(value===undefined)return '';
 if(typeof value!=='string'||[...value].length>MAX_VISUAL_INTENT_LENGTH||/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(value))throw new Error('仕上がりのイメージは300文字以内の文章で指定してください。');
 return value.trim();
}
export function normalizeVideoBrief(value){
 if(value===undefined)return '';
 if(typeof value!=='string'||[...value].length>1000||/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(value))throw new Error('動画内容の補足は1000文字以内の文章で指定してください。');
 return value.trim()?value:'';
}
export const COMPLETE_MOOD_EXAMPLES=Object.freeze([
 {label:'落ち着いた旅',text:'ゆっくりした旅の雰囲気。写真を自然に見せ、文字も穏やかに。'},
 {label:'明るい日常',text:'明るく爽やかな日常。親しみやすく、飾りすぎない感じ。'},
 {label:'上品・洗練',text:'上品で洗練された感じ。すっきりした誌面のような雰囲気。'},
 {label:'映画のような雰囲気',text:'映画のタイトルのような雰囲気。写真の空気感を大切に。'},
 {label:'柔らかく親しみやすい',text:'柔らかく親しみやすい感じ。子どもっぽくせず自然に。'},
 {label:'わかりやすい解説',text:'内容がすぐ伝わる、わかりやすい解説のイメージ。'},
 {label:'力強くシンプル',text:'力強くシンプルに。大げさな装飾や派手すぎる色は避けたい。'},
 {label:'懐かしく温かい',text:'懐かしく温かい感じ。写真は自然なままで、落ち着いた雰囲気。'}
].map(x=>Object.freeze(x)));
export const COMPLETE_PATTERN_SEEDS=Object.freeze([
 {id:'quiet_caption',typography:'Upright humanist sans-serif, medium weight and open counters.',layout:'A compact edge caption using an existing quiet area; keep the scene dominant.',context:'Quiet travel or everyday life.'},
 {id:'editorial_open',typography:'Sturdy editorial serif or Japanese Mincho, regular to semibold.',layout:'An asymmetrical short headline in open space, with restrained hierarchy.',context:'Refined lifestyle or thoughtful stories.'},
 {id:'airy_diary',typography:'Open, softly rounded sans-serif, medium weight; no childish bubble lettering.',layout:'A light compact text block in a corner or edge with safe margins.',context:'Friendly, bright daily-life footage.'},
 {id:'cinematic_title',typography:'Upright cinematic serif or restrained sans-serif, with readable spacing and sturdy strokes.',layout:'A single line or short two-line title in existing negative space.',context:'Atmospheric personal stories; no invented dramatic events.'},
 {id:'clear_teaching',typography:'Typeset semibold Japanese Gothic or sans-serif, open counters and consistent stroke widths; one heavier key phrase.',layout:'One short hierarchical block in clear space beside the subject, with a smaller lead-in only if it is needed for meaning; no fabricated number badges.',context:'Explanations and practical tutorials with a specific supported takeaway.'},
 {id:'bold_contrast',typography:'Typeset upright bold Gothic or condensed sans-serif, straight baselines and crisp solid strokes; no distressed brush texture.',layout:'An upper heading may flank the existing subject when both upper corners are clear; otherwise use one compact side block. Do not move the subject to manufacture a split heading.',context:'Direct, energetic topics; create impact with a key phrase rather than stickers.'},
 {id:'understated_minimal',typography:'Clean geometric sans-serif, regular to medium weight; do not use tiny or hairline text.',layout:'One compact offset headline using the photo as the main visual.',context:'Simple, contemporary, uncluttered presentation.'},
 {id:'warm_classic',typography:'Readable upright slab serif or softly shaped Gothic with solid strokes.',layout:'A short heading near a naturally quiet edge with warm neutral lettering.',context:'Warm, nostalgic tone without repainting the photograph.'},
 {id:'relaxed_handwritten',typography:'Readable relaxed hand-lettering with open counters, sturdy strokes and moderate natural irregularity. Keep it personal rather than exaggerated comic or aggressive brush lettering.',layout:'A short two-line heading in existing open space beside the actual subject. Let the available space determine the side; avoid faces and hands, and use at most one modest underline only if it supports the mood.',context:'Use only when a personal diary or relaxed travel atmosphere actually calls for hand-lettering. Calmness alone does not require script, and it must not turn a Japanese story into a one-word English topic label.'}
].map(x=>Object.freeze({...x,status:'experimental'})));
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
  'AUTO ART DIRECTION: inspect the attached photograph and video context, then choose a composition suited to this actual image. The user has not selected a design recipe.',
  'PHOTO: identify the actual subject, faces, hands and important objects, their occupied areas, and unobstructed low-detail space. Keep the photographed scene and subject positions intact. Do not create empty space by relocating a person or inventing a background.',
  'CONTEXT: match the typography and visual hierarchy to the topic and mood in the video title and brief. Quiet everyday or travel footage needs restrained lettering; a tutorial may need stronger hierarchy. Do not assume every video needs dramatic advertising.',
  `LAYOUT: ${override?`${override.prompt} This explicit placement is a user constraint; choose type size and line breaks to fit that zone without covering faces or key objects.`:'Consider left, right, upper and lower headline zones, and choose the feasible zone that best preserves the subject and scene while keeping the words legible. Choose text size, line breaks, alignment and safe margins for the available space. Do not always default to a top strip, bottom caption or side billboard.'}`,
  'TYPOGRAPHY: choose one coherent font style and weight to suit the context, headline length and photographic space. Readable sans-serif, serif/Mincho or condensed bold are examples, not a closed list of three templates. Do not select a layout by a preset rotation or merely recolor the same poster.',
  'TYPESETTING BASELINE: for Japanese use familiar, crisp typeset Gothic letterforms with consistent stroke widths and open counters, similar in construction to Noto Sans JP or Source Han Sans; choose medium/semibold for quiet content and bold/heavy for a key phrase. For a genuinely editorial mood use sturdy Mincho with visible serifs. Font names describe letterform construction, not a font-file guarantee. Keep one family, coherent baselines and tight but non-touching spacing. Do not default to hand-drawn calligraphy, brush distress, swollen glyphs, extreme skew, 3D extrusion or layered sticker outlines. Use handwritten lettering only when the requested mood and content call for it.',
  'HIERARCHY: make the meaningful key phrase about 1.3-1.6 times the size of any necessary lead-in, rather than enlarging every word. Aim for one compact block and one or two main lines, adapting to the available space and exact manual copy. Calm does not mean tiny or vague; energetic does not mean every word must shout. Start with solid white or warm neutral text and at most one accent color. Add a thin dark edge or short soft shadow only where contrast requires it; no stacked outlines, fire gradients or ornamental paint swashes.',
  ...(override?[]:[
   'REFERENCE-DERIVED LAYOUT STUDIES: use the spatial relationship, not the people, wording or objects of a reference. These are alternatives within the same photograph, not mandatory panels or a rotation:',
   'UPPER FLANKS: when the existing subject occupies the center and both upper corners are clear, place related parts of one short headline around the head, with a shared baseline and one dominant phrase. If only one corner is free, keep a single block there; do not force symmetry.',
   'LOWER ANCHOR: when the upper image contains important scene information and the lower area is clear, anchor one wide, one- or two-line headline below it. Use a local directional shadow or shallow gradient under the letters, fading into the photograph; keep faces, hands and important objects visible.',
   'COMPACT SIDE: when the subject already sits left or right, place one asymmetrical headline block in the opposite existing low-detail space. A subject on the left is not a reason to move it right. If no large zone is free, shorten automatic copy or reduce the block before considering a different whole-photo crop.',
   'Check more than one feasible zone against this actual photo and the chosen headline. Select the zone that communicates the moment and preserves the scene. Do not treat every video as the same large left-hand billboard or replace a meaningful message with a small decorative corner label.'
  ]),
  'PATTERN IDEAS: the following combinations are optional experimental starting points, not proven high-performing templates. Select or adapt only what fits the actual photograph, video context and requested atmosphere; do not print these names or force a different pattern on each request.',
  ...COMPLETE_PATTERN_SEEDS.map(x=>`${x.id}: ${x.typography} ${x.layout} Suitable context: ${x.context}`),
  'READABILITY: use the least intrusive local treatment needed. Prefer clear existing space and readable letterforms. Avoid a broad cloudy blur, heavy glow or dark halo around the headline. Do not darken or blur the whole photograph or add a large empty panel.',
  'Make these choices within this single image edit. Output only the finished thumbnail, without layout labels, explanations or invented comparison panels.'
 ].join('\n');
}
export function completeDesignSummary(design='auto',composition='auto'){
 const recipe=COMPLETE_DESIGNS[design],override=placements[composition];
 return recipe?`${recipe.fontLabel}。配置の希望：${override?.label??recipe.layoutLabel}。${override?'構図を固定しています。配置も変える場合は「写真と内容に合わせてAIが決める」を選んでください。':''}`:
  `写真の主役・文字を置ける余白と動画の内容から、AIが字体・文字サイズ・配置を決めます。${override?'構図を固定しているため、見出しの位置はこの指定を優先します。':'配置もAIに任せています。'}実際の字体・位置・選択理由は未取得で、完成画像で確認します。`;
}
