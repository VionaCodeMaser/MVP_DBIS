import dataset from '../server/data/syntheticReportData.json'
import savedExamples from './data/replayExamples.json'
import type { DemoData } from './shared/demo'
import { buildReportFromData } from './shared/gpReport'
import type { GpReport } from './shared/gpReport'
import { parseExamples, ReplaySession } from './shared/replay'
export const replayOnly=import.meta.env.VITE_REPLAY_ONLY==='true'
export const isReplay=replayOnly||new URLSearchParams(location.search).get('mode')!=='live'
export const examples=parseExamples(savedExamples)
export const session=new ReplaySession({getItem:key=>window.sessionStorage.getItem(key),setItem:(key,value)=>window.sessionStorage.setItem(key,value),removeItem:key=>window.sessionStorage.removeItem(key)})
export const baseUrl=import.meta.env.BASE_URL
export const pageUrl=(page: ''|'report.html',mode: 'replay'|'live'=isReplay?'replay':'live')=>`${baseUrl}${page}?mode=${mode}`
export async function jsonRequest(url:string,options?:RequestInit) {
  const response=await fetch(url,options)
  const data=await response.json()
  if(!response.ok)throw new Error(data.error?.message||'Request failed')
  return data
}
export async function getDemo():Promise<DemoData>{ return isReplay?dataset as DemoData:jsonRequest('/api/demo') }
export async function getReport():Promise<GpReport> {
  if(!isReplay)return jsonRequest('/api/reports/gp?patientId=synthetic-demo-patient')
  const demo=dataset as DemoData
  const patient=demo.patients[0]
  const records=[...session.records(),...patient.checkins].sort((a,b)=>b.timestamp.localeCompare(a.timestamp))
  return buildReportFromData(patient,demo.period,records)
}
export function modeBanner() {
  return `<div class="mode-banner"><div><strong>${isReplay?'Example replay':'Live Ollama'} mode</strong><p>${isReplay?'No microphone or Ollama required. Selected examples are saved in this browser tab only.':'Actual Whisper and Ollama extraction; a local backend and Ollama are required.'}</p></div><nav aria-label="Demo mode"><a href="${pageUrl('', 'replay')}" ${isReplay?'aria-current="page"':''}>Example replay</a>${replayOnly?'<span>Live version: run the repository locally</span>':`<a href="${pageUrl('', 'live')}" ${!isReplay?'aria-current="page"':''}>Live Ollama</a>`}</nav></div>`
}
