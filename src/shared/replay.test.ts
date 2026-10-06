import { describe, expect, it } from 'vitest'
import savedExamples from '../data/replayExamples.json'
import dataset from '../../server/data/syntheticReportData.json'
import { parseExamples, ReplaySession, replayRecord } from './replay'
import { buildReportFromData } from './gpReport'
import type { DemoData } from './demo'
import { CheckinAnalysisSchema } from './checkinValidation'
const examples=parseExamples(savedExamples)
const storage=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}}}
describe('example replay without live AI',()=>{
 it('validates all three exact transcript/evidence fixtures and preserves medication uncertainty',()=>{
  expect(examples).toHaveLength(3)
  expect(examples[0].analysis.medicationAdherence).toBe('reported_not_yet_taken')
  expect(examples[1].analysis.medicationAdherence).toBe('uncertain')
  expect(examples[2].analysis.requiresHumanReview).toBe(true)
  for(const e of examples)expect(CheckinAnalysisSchema.safeParse(e.analysis).success).toBe(true)
 })
 it('creates unconfirmed unified records with honest fixture provenance',()=>{
  const r=replayRecord(examples[0],'2026-10-06T12:00:00.000Z')
  expect(r.confirmationStatus).toBe('unconfirmed')
  expect(r.provenance).toMatchObject({mode:'example_replay',origin:examples[0].provenance.origin,exampleId:examples[0].id})
  expect(r.observations.find(o=>o.category==='medication_adherence')?.value.state).toBe('reported_not_yet_taken')
  expect(r.transcript).toBe(examples[0].transcript)
 })
 it('shows the identical stored record in the GP report without changing dispensing calculations',()=>{
  const shared=storage();const watch=new ReplaySession(shared);const gp=new ReplaySession(shared)
  const saved=watch.add(examples[2]);const demo=dataset as DemoData
  const report=buildReportFromData(demo.patients[0],demo.period,[...gp.records(),...demo.patients[0].checkins])
  expect(report.checkins.find(r=>r.id===saved.id)).toEqual(saved)
  expect(report.recentCheckins.find(r=>r.id===saved.id)).toEqual(saved)
  expect(report.dispensingAdherence).toBe(83.3)
  expect(report.missedClusters[0]).toMatchObject({from:'2026-09-18',to:'2026-09-20',count:3})
  expect(report.wearable).toEqual(demo.patients[0].wearable)
 })
 it('keeps visitors separate and resets only the current replay session',()=>{
  const a=new ReplaySession(storage());const b=new ReplaySession(storage());a.add(examples[0]);a.add(examples[1]);b.add(examples[2]);a.reset()
  expect(a.records()).toEqual([]);expect(b.records()).toHaveLength(1)
 })
 it('does not inflate the check-in count on repeat selections and survives navigation',()=>{
  const shared=storage();const s=new ReplaySession(shared);s.add(examples[0]);const last=s.add(examples[0])
  expect(new ReplaySession(shared).records()).toEqual([last])
 })
 it('rejects fabricated evidence and incomplete model-capture claims',()=>{
  const fake=structuredClone(savedExamples);fake[0].analysis.symptoms[0].evidence='not in the transcript';expect(()=>parseExamples(fake)).toThrow()
  const claim=structuredClone(savedExamples) as any;claim[0].provenance.origin='ollama_capture';delete claim[0].provenance.model;expect(()=>parseExamples(claim)).toThrow()
 })
 it('recovers from malformed session data',()=>{const s=storage();s.setItem('pulsenote.example-replay.v1','broken');expect(new ReplaySession(s).records()).toEqual([])})
})
