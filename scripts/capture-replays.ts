import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fetch } from 'undici'
import { analyzeCheckin, OLLAMA_MODEL, OLLAMA_URL } from '../server/analyzeCheckin'
import { parseExamples, ReplayExampleSchema } from '../src/shared/replay'
const path=fileURLToPath(new URL('../src/data/replayExamples.json',import.meta.url))
async function capture() {
  const examples=parseExamples(JSON.parse(await fs.readFile(path,'utf8')))
  const tags=await fetch(`${OLLAMA_URL}/api/tags`)
  if(!tags.ok)throw new Error('Ollama model list unavailable')
  const inventory=await tags.json() as {models?:{name:string;model?:string;digest:string}[]}
  const model=inventory.models?.find(m=>m.name===OLLAMA_MODEL||m.model===OLLAMA_MODEL||m.name===`${OLLAMA_MODEL}:latest`)
  if(!model?.digest)throw new Error(`Model ${OLLAMA_MODEL} not installed. Run: ollama pull ${OLLAMA_MODEL}`)
  const captured=[]
  for(const example of examples) {
    console.log(`Capturing ${example.title} with ${OLLAMA_MODEL}…`)
    const analysis=await analyzeCheckin({transcript:example.transcript})
    const expected=example.id==='symptom-medication'?'reported_not_yet_taken':example.id==='medication-uncertainty'?'uncertain':'not_mentioned'
    if(analysis.medicationAdherence!==expected)throw Error(`${example.id}: unexpected medication state ${analysis.medicationAdherence}; inspect before publishing`)
    if(example.id==='symptom-medication'&&!analysis.symptoms.some(s=>/neck/i.test(s.label)))throw Error('Neck symptom not extracted; inspect model output')
    if(example.id==='context-review'&&!analysis.requiresHumanReview)throw Error('Review flag missing; inspect model output')
    captured.push(ReplayExampleSchema.parse({...example,analysis,provenance:{origin:'ollama_capture',model:OLLAMA_MODEL,modelDigest:model.digest,capturedAt:new Date().toISOString(),pipeline:'Whisper bypassed: synthetic typed transcript → analyzeCheckin (Ollama + explicit transcript rules) → V4 schema and evidence validation'}}))
  }
  // Replace the entire file only after all three succeed; failed captures leave existing fixtures intact.
  await fs.writeFile(path+'.tmp',JSON.stringify(parseExamples(captured),null,2)+'\n')
  await fs.rename(path+'.tmp',path)
  console.log('Three genuine validated captures saved. Review the fixture diff, then commit it and rebuild/redeploy.')
}
capture().catch(error=>{console.error('Capture failed. Existing examples unchanged:',error instanceof Error?error.message:error);process.exitCode=1})
