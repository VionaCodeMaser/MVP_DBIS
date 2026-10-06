import { z } from 'zod'
import type { UnifiedCheckin } from './checkin'
import { CheckinAnalysisSchema } from './checkinValidation'
import { transformAnalysisToCheckin } from './checkinTransform'
export const ReplayExampleSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), transcript: z.string().min(1),
  analysis: CheckinAnalysisSchema,
  provenance: z.object({origin:z.enum(['curated','ollama_capture']),pipeline:z.string().min(1),model:z.string().optional(),capturedAt:z.string().datetime().optional(),modelDigest:z.string().optional()}).strict(),
}).strict().superRefine((example, ctx)=>{
  const a=example.analysis
  const evidence=[...a.symptoms.map(s=>s.evidence),a.confusion.evidence,a.emotionalEvidence,a.medicationEvidence,a.context.possibleDisorientation.evidence,a.context.socialIsolation.evidence,a.context.contactPreference.evidence]
  if(evidence.some(e=>e!==null&&!example.transcript.includes(e)))ctx.addIssue({code:'custom',message:'Every evidence quote must be an exact transcript substring'})
  if(example.provenance.origin==='ollama_capture'&&(!example.provenance.model||!example.provenance.capturedAt||!example.provenance.modelDigest))ctx.addIssue({code:'custom',message:'Ollama capture requires model, digest and capture timestamp'})
})
export type ReplayExample = z.infer<typeof ReplayExampleSchema>
export const parseExamples = (value: unknown) => z.array(ReplayExampleSchema).length(3).refine(items=>new Set(items.map(e=>e.id)).size===3,'Example IDs must be unique').parse(value)
export function replayRecord(example: ReplayExample, timestamp=new Date().toISOString()): UnifiedCheckin {
  const validated=ReplayExampleSchema.parse(example)
  const record=transformAnalysisToCheckin({analysis:validated.analysis,transcript:validated.transcript,inputSource:'pasted_text',confirmationStatus:'unconfirmed',timestamp})
  record.provenance={mode:'example_replay',exampleId:validated.id,...validated.provenance}
  return record
}
export const replayLabel = (origin: 'curated'|'ollama_capture') => origin==='ollama_capture'?'Precomputed Ollama example — no live AI extraction':'Curated example — no live AI extraction'
export interface ReplayStorage { getItem(key:string):string|null; setItem(key:string,value:string):void; removeItem(key:string):void }
const STORAGE_KEY='pulsenote.example-replay.v1'
export class ReplaySession {
  constructor(private storage: ReplayStorage) {}
  records(): UnifiedCheckin[] {
    const json=this.storage.getItem(STORAGE_KEY)
    if(!json)return []
    try {
      const value=JSON.parse(json)
      if(!Array.isArray(value)||!value.every(r=>r.schemaVersion==='unified-checkin.v1'&&r.provenance?.mode==='example_replay'&&typeof r.id==='string'&&typeof r.timestamp==='string'&&Array.isArray(r.observations)))throw Error()
      return value
    } catch { this.storage.removeItem(STORAGE_KEY); return [] }
  }
  add(example: ReplayExample): UnifiedCheckin {
    const record=replayRecord(example)
    // One entry per selected example avoids inflating the report on repeat clicks.
    const records=this.records().filter(r=>r.provenance?.exampleId!==example.id)
    this.storage.setItem(STORAGE_KEY,JSON.stringify([record,...records]))
    return record
  }
  reset(){this.storage.removeItem(STORAGE_KEY)}
}
