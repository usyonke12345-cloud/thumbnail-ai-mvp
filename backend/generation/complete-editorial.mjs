// Artificial editing examples, not user records or extra text to put on an image.
export const HEADLINE_EDITING_EXAMPLES=Object.freeze([
 {title:'朝の散歩で、いつもの道に春の花を見つけた休日',weak:'WALK',headline:'いつもの道に、春',basis:'いつもの道に春の花を見つけた',note:'Keep the discovery, not just the activity name.'},
 {title:'初めて陶芸を体験したら、器の形を整えるのが想像以上に難しかった',weak:'陶芸体験',headline:'丸くするのが、難しい',basis:'器の形を整えるのが想像以上に難しかった',note:'Keep the specific difficulty without inventing failure or a finished result.'},
 {title:'雨の京都で急がず過ごす一日',weak:'KYOTO',headline:'雨の日は、ゆっくり',basis:'雨、急がず過ごす',note:'A quiet experience can be the appeal; no dramatic twist is required.'},
 {title:'港食堂の定食を朝昼晩食べた一日',weak:'ごはんを食べた',headline:'一日中、港食堂',basis:'港食堂の定食、朝昼晩',note:'The named shop is central; a generic food label loses the identity of the video.'},
 {title:'フルマラソン2時間20分台ランナーの休日',weak:'ランナーの一日',headline:'2時間20分台の休日',basis:'2時間20分台ランナーの休日',note:'Preserve the stated range and unit; do not turn it into an exact finish time or invent a race result.'}
].map(x=>Object.freeze(x)));

export function headlineInstructions(mode='manual'){
 if(mode!=='auto')return 'Render exactly the supplied headline, with natural line breaks and strong hierarchy. Do not rewrite, translate or add a hook to manual copy. The headline is the only text to render.';
 return [
  'Choose one short thumbnail headline from the video title and optional brief, then render it. HEADLINE EDITING: communicate one reason to watch: a specific action, discovery, difficulty, stated outcome or atmosphere of this video. Preserve the most distinctive supported detail when shortening. A generic topic label, place, drink or activity name alone is insufficient when it loses that detail.',
  'Use the language of the video title. Do not replace a Japanese story with decorative English or romanized topic words unless the current user explicitly asks for that treatment. Prefer a concise Japanese phrase or roughly 2-6 English words; retain meaning rather than meet a rigid character target.',
  'Ground every factual part of the headline in the current title or brief; do not invent results, numbers, claims, quotes, before/after events or a causal link. If the brief and title conflict, use only their compatible facts. The photograph informs placement and mood, not evidence of unmentioned events. A simple diary title can remain a clear diary headline; do not force suspense or exaggeration.',
  'DISTINCTIVE FACTS: identify the detail that makes this video different before shortening it. Retain a named shop, destination, product or person when that identity is central to the subject; do not replace it with a generic category. Do not copy incidental channel names, tags or every proper noun. Preserve central numbers together with their units, qualifiers and ranges exactly: a time range is not an exact result. Give the central supported detail visual emphasis rather than highlighting an unimportant lead-in.',
  'Use one main phrase with one key phrase emphasized by size or weight. A short lead-in may share the same headline block only when needed to explain it. Do not copy the whole title, add a second slogan, channel name or tiny summary line. The chosen headline is the only text to render.',
  'ARTIFICIAL EDITING EXAMPLES: learn the editing relationship, not the example words. Never render these example headlines on the current photograph:',
  JSON.stringify(HEADLINE_EDITING_EXAMPLES),
  'Before rendering, check that the chosen words still convey this video\'s distinctive appeal, retain its central named identity or number where relevant, are supported by its input and suit its requested atmosphere. If shortening removed that information, restore it instead of adding decoration or making up a stronger claim.'
 ].join('\n');
}
