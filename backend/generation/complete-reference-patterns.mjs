// Abstract spatial/type relationships observed in public thumbnails. No source
// images, video text, channel names, private reviews or measured font claims.
export const REFERENCE_PATTERN_LIBRARY_VERSION='single-photo-reference-0.1.0';
export const COMPLETE_REFERENCE_PATTERNS=Object.freeze([
 {id:'lower_sentence',sources:['TPZ6oLhIOjM','YlMdGxoY4hs'],
  typography:'Upright bold Gothic or sans-serif, open counters, solid strokes; white or neutral lettering with a thin dark edge only if needed.',
  layout:'One short sentence along the lower edge, leaving the upper scene photographic.',
  when:'The lower edge is clear of faces, hands and important objects; the scene itself carries useful context.',
  avoid:'Do not cover hands or props, or turn this into a large side billboard.'},
 {id:'upper_two_lines',sources:['SKk9feN-Gso','LUMLhkPjOL4'],
  typography:'Crisp typeset Gothic or sans-serif; a clear main line and a quieter supporting phrase when required for meaning.',
  layout:'A compact upper headline with one or two lines, keeping the subject and lower scene visible.',
  when:'The subject is lower in the photograph and there is real, uncluttered space above.',
  avoid:'Do not cover the head or manufacture a top panel, frame or extra bottom label.'},
 {id:'center_serif',sources:['syGlUxwPiJo'],
  typography:'Readable upright editorial serif; for Japanese a sturdy Mincho interpretation with open counters, not hairline strokes.',
  layout:'One short central headline with controlled width; let the photograph remain full-bleed.',
  when:'The center contains open scenery rather than a face, hands or a key object, and the content suits an editorial mood.',
  avoid:'Do not force a centered headline over the subject. Keep the video meaning instead of reducing it to an English place name.'},
 {id:'corner_serif',sources:['GD86QC-jzWU'],
  typography:'Sturdy serif or Japanese Mincho, regular to semibold; clear letterforms without a heavy sticker outline.',
  layout:'A compact asymmetrical headline anchored to one genuinely clear corner, with readable size and edge insets.',
  when:'A quiet corner can carry the words without obscuring photographic information.',
  avoid:'Do not copy the source collage, introduce other scenes, or make the text too small to convey the appeal.'},
 {id:'upper_handwritten',sources:['XF-FbhyuxY8'],
  typography:'Light, legible personal hand-lettering with sturdy strokes; natural Japanese lettering when the title is Japanese.',
  layout:'A short horizontal heading in existing upper space, leaving the photographed person intact below.',
  when:'Personal travel or a relaxed diary mood specifically supports handwritten lettering and the upper area is clear.',
  avoid:'Calmness alone does not require handwriting. No aggressive brush distress, broad painted banner or invented blue strip.'},
 {id:'subject_wrap',sources:['hZzCNzw5YtI'],
  typography:'Friendly, open hand-lettering or humanist sans-serif, with moderate weight and at most a restrained accent.',
  layout:'A very short headline following a gentle arc in existing space around the subject, never across the face.',
  when:'The words are short enough to read on a gentle curve and there is genuine space around the subject.',
  avoid:'Do not curve a long Japanese headline, scatter unrelated text fragments or cover faces, hands or objects. Use a straight block if the arc is not readable.'},
 {id:'scene_caption',sources:['BJKfoYlzmHo','8FBSz9RR3gg'],
  typography:'Clean medium-weight sans-serif or restrained personal script; solid, readable strokes, not a tiny signature.',
  layout:'A concise modest-scale caption in quiet space, giving the photographic moment most of the frame.',
  when:'The actual scene communicates the topic strongly and the requested atmosphere is quiet or personal.',
  avoid:'A small decorative word is insufficient when it loses the reason to watch. Keep the concrete supported message and enough type size to read it.'},
 {id:'upper_flanks',sources:['0dz-e5UtO5o'],
  typography:'Bold crisp Gothic or sans-serif, one coherent family and readable baselines; any slant must stay restrained.',
  layout:'Related parts of one short headline flank the existing central subject in the clear upper corners.',
  when:'The subject is centered and both upper corners have enough real space; both phrases belong to one message.',
  avoid:'Do not relocate the person, force symmetry, add a second slogan, or copy reference arrows, question marks or lighting.'},
 {id:'upper_serif',sources:['BKHKk1iGCPw','rXFBKnW--Z4'],
  typography:'Readable upright serif or sturdy Japanese Mincho with clear strokes and moderate weight.',
  layout:'A short wide headline across the upper clear space, keeping the photographic subject below unobscured.',
  when:'The top has enough continuous open space and a refined or travel-story mood supports serif lettering.',
  avoid:'Do not copy bilingual subtitles, dates, flags or collage panels, translate automatically, or stretch the heading across a face.'}
].map(value=>Object.freeze({...value,sources:Object.freeze(value.sources),status:'experimental'})));

export function completeReferencePatternInstructions({design='auto',composition='auto',revision}={}){
 // These are whole-scene typography/placement examples, not cutout recipes.
 // Do not let them replace a requested material edit or revision.
 if(design!=='auto'||composition!=='auto'||revision)return '';
 return [
  `REFERENCE PATTERN LIBRARY: ${REFERENCE_PATTERN_LIBRARY_VERSION}. These are abstract observed design relationships, not proven high-performing templates or learned model weights.`,
  'Select typography AND placement together from the conditional candidates below, using the actual attached photograph, current headline meaning and desired atmosphere. These are candidate directions, not nine images to render.',
  'First inspect occupied areas and existing clear space. Internally compare two or three feasible candidates with different letterform or placement treatments; choose one coherent treatment for this image. Do this inside this single edit, not through extra calls, a random rotation, or new panels. If only one zone is feasible, preserve it and choose context-appropriate lettering rather than moving the person just for variety.',
  'The lettering should visibly reflect the chosen family: Gothic, serif/Mincho, or genuinely readable personal handwriting. Do not turn every family into the same oversized bold Gothic block with a yellow key phrase. A single neutral color can be sufficient; select an accent only when it clarifies the message. The explicit atmosphere and photo preservation constraints take priority.',
  ...COMPLETE_REFERENCE_PATTERNS.map(({id,typography,layout,when,avoid})=>JSON.stringify({id,typography,layout,suitableWhen:when,avoid})),
  'Use only a candidate whose conditions are met. If none is feasible, use a simple readable headline in existing clear space; do not manufacture space, add another photo, invent events or discard the meaningful headline. Manual headline text remains exact. Do not render candidate IDs, reference information or explanation text.',
  'No reference image is attached: borrow only these abstract letterform and spatial relationships. Do not imitate a particular person, channel identity, wording or scene. The chosen family and its successful rendering are not being reported as measured metadata.'
 ].join('\n');
}
