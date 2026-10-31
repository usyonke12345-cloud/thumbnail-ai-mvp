// Requested photographic treatment, not a pixel-preservation guarantee.
export function completePhotoFinishInstructions(input){
 if(input.referenceMode!=='required')return '';
 return [
  'NATURAL PHOTO FINISH: preserve each source photograph\'s existing exposure, white balance, tonal range and photographic texture as the baseline. Make only small corrections needed for visibility; it is acceptable for different source photos to retain different lighting. Do not force a uniform dramatic grade across the panels.',
  'NO GENERATIVE DETAIL ENHANCEMENT: retain the source skin texture, facial detail, hair and camera softness. Do not beautify or smooth skin, sharpen eyes or invent hair strands, pores or other detail absent from the source. A slightly soft original must remain naturally soft rather than be rebuilt as a crisp synthetic portrait.',
  'RESTRAIN COLOR AND CONTRAST: avoid HDR, clarity/dehaze effects, heavy edge sharpening, crushed dark shadows, boosted saturation, orange skin, artificial rim lights or fake background blur. Do not make the photograph look more processed just to match bold lettering.',
  'REFERENCE SCOPE: apply the example observations primarily to typography, hierarchy, spacing and composition. Do not transfer their color grade, skin retouching, lighting or photographic polish to the user\'s source material. Create emphasis with readable type and restrained local treatment behind text.',
  'EXPLICIT PHOTO PANELS: when the user asks for whole-photo panels or a collage, honor that arrangement using crops and scaling of the full photographs. Do not force a separate subject cutout or repaint the photographs merely because recompose is selected. Current explicit layout instructions take priority over a default spatial-edit recipe.',
  'Before returning, compare photo treatment against the source photographs and reduce any added photographic processing. This is an instruction to the image model, not a report that preservation was measured.'
 ].join('\n');
}
