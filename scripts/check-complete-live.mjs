// Explicit one-call quality check. Run only when a paid test is authorized.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {generateComplete} from '../backend/generation/complete.mjs';
process.env.OPENAI_MAX_CALLS='1';
const image=await readFile(process.argv[2]);
const output=resolve(process.argv[3]);await mkdir(output,{recursive:true});
const start=Date.now();
const result=await generateComplete({title:'how to ACTUALLY find your PERFECT HAIRSTYLE',brief:'FIND YOUR HAIR STYLE. Use the supplied two portraits to explain finding a flattering haircut. Preserve both faces and hairstyles.',headline:'FIND YOUR\nPERFECT\nHAIRSTYLE',imageDataUrl:`data:image/png;base64,${image.toString('base64')}`,consent:true});
await writeFile(resolve(output,'thumbnail.png'),Buffer.from(result.imageDataUrl.split(',')[1],'base64'));
await writeFile(resolve(output,'report.json'),JSON.stringify({mode:result.mode,generation_version:result.generation_version,width:result.width,height:result.height,elapsedMs:Date.now()-start,limitations:result.limitations,actualCost:'Check provider usage dashboard; not inferred from response'},null,2));
console.log(JSON.stringify({output,elapsedMs:Date.now()-start,width:result.width,height:result.height}));
