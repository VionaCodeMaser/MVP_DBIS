import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { app } from './app'
import { clearCheckins } from './checkinStore'
import { seedDemoCheckins } from './demoData'
let server: Server
let base: string
beforeAll(async()=>{ clearCheckins();seedDemoCheckins();server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No port');base=`http://127.0.0.1:${address.port}` })
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));clearCheckins()})
const analysis={analysisSchemaVersion:'checkin-analysis.v4',symptoms:[{label:'neck pain',status:'present',evidence:'My neck hurts'}],confusion:{detected:false,topic:null,evidence:null},emotionalState:'not_stated',emotionalPolarity:'not_stated',emotionalEvidence:null,medicationAdherence:'reported_not_yet_taken',medicationEvidence:'I haven’t taken my meds',context:{possibleDisorientation:{detected:false,evidence:null},socialIsolation:{reported:false,evidence:null},contactPreference:{noContactRequested:false,evidence:null}},requiresHumanReview:false}
const post=(body:unknown)=>fetch(`${base}/api/checkins`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
describe('connected MVP backend journey',()=>{
 it('retrieves the identical unconfirmed record through check-ins and the GP report, even after September',async()=>{
  const response=await post({transcript:'My neck hurts, I haven’t taken my meds',analysis,inputSource:'microphone',timestamp:'2026-10-04T10:00:00.000Z',confirmationStatus:'unconfirmed'})
  expect(response.status).toBe(201);const saved=await response.json();expect(saved.confirmationStatus).toBe('unconfirmed');expect(saved.observations[0].value.status).toBe('present')
  const records=await (await fetch(`${base}/api/checkins?patientId=synthetic-demo-patient`)).json()
  const report=await (await fetch(`${base}/api/reports/gp`)).json()
  expect(records.checkins.find((r:{id:string})=>r.id===saved.id)).toEqual(saved)
  expect(report.recentCheckins.find((r:{id:string})=>r.id===saved.id)).toEqual(saved)
  expect(report.dispensingAdherence).toBe(83.3)
  const demo=await(await fetch(`${base}/api/demo`)).json();expect(report.wearable).toEqual(demo.patients[0].wearable)
 })
 it('retains the transcript without observations when extraction fails',async()=>{
  const response=await post({transcript:'Synthetic captured message',inputSource:'pasted_text',extractionStatus:'failed'})
  expect(response.status).toBe(201);expect(await response.json()).toMatchObject({transcript:'Synthetic captured message',confirmationStatus:'unconfirmed',extractionStatus:'failed',observations:[]})
 })
 it('rejects invalid analyses and unsupported patients',async()=>{
  expect((await post({transcript:'Synthetic',analysis:{},inputSource:'microphone'})).status).toBe(400)
  expect((await post({transcript:'Synthetic',inputSource:'microphone',extractionStatus:'failed',syntheticPatientId:'another-patient'})).status).toBe(400)
 })
})
