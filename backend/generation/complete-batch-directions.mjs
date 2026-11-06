// Requested art directions, not observed output styles or quality judgements.
export const BATCH_ART_DIRECTIONS=Object.freeze([
 Object.freeze({
  id:'natural',label:'写真を生かす自然な案',design:'photo_focus',generationVersion:'ai-complete-0.15.0-natural',
  rhythm:'Use a compact headline group with relaxed spacing and a gentle size contrast. Keep graphic treatment minimal within the explicit design.',
  photography:'Use an environmental, wider photographic view: keep the scene and its context dominant. For multiple sources, make the main scene large and integrate the other photographs as unobtrusive supporting scene crops. Avoid equally sized tiles.',
  typography:'Use clean upright humanist Gothic/sans-serif with open counters and medium weight. Use a compact but clearly readable headline with generous breathing room, without a heavy outline.',
  graphics:'Let the natural photograph fill the frame. Use white or a soft neutral for most lettering, one restrained accent at most, and only a small local readability treatment. No color banner or editorial mat.',
  headline:'For auto wording, use a short, concrete scene-led phrase that still retains the distinctive supported person, place, result or action. Avoid a vague mood word as the whole message.'
 }),
 Object.freeze({
  id:'editorial',label:'余白を生かす上品な案',design:'editorial',generationVersion:'ai-complete-0.15.0-editorial',
  rhythm:'Use deliberate whitespace and measured gaps between the main phrase and supporting words. Favor a composed, refined reading rhythm within the explicit design.',
  photography:'Treat the original photograph as an editorial image with intentional whitespace and an off-white graphic margin, not an invented scene. For multiple sources, use an asymmetric large image and smaller supporting images with quiet spacing rather than a full-bleed equal-panel collage.',
  typography:'Use sturdy upright serif/Mincho letterforms with visible serifs and a regular or semibold weight. Create a deliberate line break and a refined hierarchy with generous spacing. Keep it legible at thumbnail size.',
  graphics:'Use an off-white or dark neutral graphic area and a restrained accent drawn from the source palette. Keep the photograph naturally colored. No yellow billboard, sticker treatment or noisy texture.',
  headline:'For auto wording, frame the supported subject as a concise editorial story title. Preserve important names and numbers; do not invent a new story to sound sophisticated.'
 }),
 Object.freeze({
  id:'message',label:'見どころが伝わる明快な案',design:'impact',generationVersion:'ai-complete-0.15.0-message',
  rhythm:'Use a tight headline group with a stronger main/supporting size contrast and a crisp restrained accent on the key phrase, within explicit color and style choices.',
  photography:'Choose a visibly tighter whole-photo crop around a useful focal subject or source object, preserving its real appearance and enough context. For multiple sources, create a strong large/small visual hierarchy with useful supporting details rather than repeating an equal-panel collage. Do not duplicate a person.',
  typography:'Use bold upright typeset Gothic/sans-serif with clear large/small hierarchy and tight, readable grouping. Make the distinctive supported subject, number, result or action the visual anchor. Avoid brush, comic and extruded lettering.',
  graphics:'Use one crisp flat accent band or compact color block behind the main phrase, with quiet secondary lettering. Choose the accent for the requested feeling rather than always yellow. Create impact through graphic hierarchy, not a stronger photographic color grade.',
  headline:'For auto wording, lead with the supported reason to watch. Make the distinctive fact prominent without clickbait, invented results, or an extra slogan.'
 })
]);

export function batchArtDirection(input){
 if(!input._batchDirection)return null;
 const direction=BATCH_ART_DIRECTIONS.find(value=>value.id===input._batchDirection.id);
 if(!direction)throw new Error('Unknown batch art direction.');
 return direction;
}

export function batchArtInstructions(input){
 const direction=batchArtDirection(input);
 if(!direction)return '';
 const explicit=input._batchDirection.explicitDesign;
 return [
  `BATCH ART DIRECTION: ${direction.id}. Develop this one finished thumbnail as a distinct design concept. A changed text position alone is not a sufficient interpretation of this request.`,
  'CONCEPT PRIORITY: refine the automatically chosen design with the following photographic presentation, letterform, graphic palette and headline approach. The user atmosphere, explicit wording/emphasis, manual design/placement, revision scope and source-photo preservation remain binding. Keep calm requests calm even in the message-led concept.',
  `CONCEPT RHYTHM: ${direction.rhythm}`,
  explicit?'MANUAL DESIGN: preserve the user-selected photographic treatment and type family. Vary only compatible hierarchy, spacing and graphic details; do not replace that explicit design with this automatic concept.':[
   `PHOTOGRAPHIC PRESENTATION: ${direction.photography}`,
   `LETTERFORMS: ${direction.typography}`,
   `GRAPHIC PALETTE AND SHAPES: ${direction.graphics}`
  ].join('\n'),
  input._batchDirection.explicitComposition?'PLACEMENT: retain the explicitly requested headline zone. Seek differentiation in the other permitted design choices.':'PLACEMENT: choose the headline zone together with this concept and the usable source space; do not force a left/top/right permutation.',
  input.headlineMode==='manual'?'WORDING: render the supplied manual headline exactly; do not rewrite it for the concept.':`AUTO HEADLINE APPROACH: ${direction.headline}`,
  ...(input.revision?['REVISION SCOPE: the previous thumbnail and requested edit take priority. Apply the concept only to the requested parts; preserve unrequested photo arrangement, wording and styling.']:[]),
  'FINAL SOURCE BOUNDARY: these differences concern design, not permission to add people, invent photographic material, repaint skin or increase photo processing. Keep all supplied source photographs represented, retain their real people/objects, and honor any crop-only or minimal-processing request. Return one image, not a sheet of three designs. The requested concept is not a verified output label.'
 ].join('\n');
}
