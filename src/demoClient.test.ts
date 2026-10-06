import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules()})
describe('static replay client',()=>{
 it('runs the full replay-to-report adapter without any backend or inference requests',async()=>{
  const values=new Map<string,string>()
  vi.stubGlobal('window',{sessionStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}})
  vi.stubGlobal('location',{search:'?mode=replay'})
  const network=vi.fn(()=>{throw Error('No network allowed in replay')});vi.stubGlobal('fetch',network)
  const client=await import('./demoClient')
  const shared=await client.getDemo();expect(shared.patients[0].wearable).toHaveLength(30)
  const saved=client.session.add(client.examples[0]);const report=await client.getReport()
  expect(report.checkins.find(r=>r.id===saved.id)).toEqual(saved)
  expect(report.dispensingAdherence).toBe(83.3)
  expect(client.pageUrl('report.html')).toBe('/report.html?mode=replay')
  expect(network).not.toHaveBeenCalled()
  client.session.reset();expect((await client.getReport()).checkins.some(r=>r.id===saved.id)).toBe(false)
 })
})
