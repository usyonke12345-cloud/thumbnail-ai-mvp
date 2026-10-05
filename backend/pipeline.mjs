import { validateRequest } from '../shared/contracts.mjs';
import { generate, generationMode } from './generation/index.mjs';
import { score } from './scoring/index.mjs';
export async function runPipeline(body) {
  const input=validateRequest(body), started=performance.now();
  const candidates=await generate(input);
  const results=await Promise.all(candidates.map(async candidate=>({...candidate,assessment:await score(candidate,input)})));
  return {apiVersion:'v1',mode:generationMode(),input,candidates:results.sort((a,b)=>b.assessment.overall-a.assessment.overall),elapsedMs:Math.round(performance.now()-started)};
}
