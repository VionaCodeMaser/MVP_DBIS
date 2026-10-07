import './style.css'
import type { UnifiedCheckin } from './shared/checkin'
import type { demoData } from '../server/demoData'

type Demo = typeof demoData
const careBridgeLogo = new URL('../care_bridge_logo_transparent_dark.png', import.meta.url).href
const app = document.querySelector<HTMLDivElement>('#app')!
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
app.innerHTML = `
<div class="demo-shell">
  <header class="demo-header"><a class="brand" href="/">Pulse<span>Note</span><small>SCHOOL MVP · SYNTHETIC DATA</small></a><a class="gp-link" href="/report.html">Open GP overview ↗</a></header>
  <div class="pitch-grid">
    <section class="patient-side" aria-label="Smartwatch patient interface">
      <p class="eyebrow">01 / PATIENT EXPERIENCE</p><h1>A small check-in.<br>A clearer picture.</h1>
      <div class="screen-picker" role="tablist" aria-label="Watch screens"><button data-screen="home" role="tab" aria-selected="true">Overview</button><button data-screen="voice" role="tab" aria-selected="false">Voice</button><button data-screen="medication" role="tab" aria-selected="false">Medication</button></div>
      <main class="watch-shell"><div class="watch-frame"><div class="watch-screen">
        <section id="homeScreen" class="watch-home-screen"><div class="watch-status"><span>09:41</span><span>♥</span></div><div class="watch-greeting"><p>Good morning,</p><h2 id="patientName">Elena</h2></div><div class="watch-stat-card" aria-live="polite"><span class="stat-card-label" id="statLabel"></span><div class="stat-card-value" id="statValue"></div><span class="stat-card-detail" id="statDetail"></span></div><div class="stat-bubble-menu" aria-label="Wearable overview"><button data-stat="restingHeartRate" aria-label="Resting heart rate">♥</button><button data-stat="sleepMinutes" aria-label="Sleep">Zz</button><button data-stat="activityMinutes" aria-label="Activity">↗</button><button data-stat="steps" aria-label="Steps">••</button></div><button class="checkin-button" id="goVoice">How do you feel?</button></section>
        <section id="voiceScreen" class="recorder-screen" hidden><div class="screen-topline"><span>Voice check-in</span><span class="screen-dot"></span></div><div class="mic-orb" id="orb">♫</div><div class="screen-copy"><h2 id="voiceTitle">Ready to listen</h2><p id="voiceHint" aria-live="polite">Tap once and speak naturally</p></div><button class="record-button" id="recordButton">Start recording</button><button class="retry-button" id="again" hidden>Record again</button></section>
        <section id="medicationScreen" class="medication-screen" hidden><div class="watch-status"><span>20:00</span><span>♥</span></div><div class="pill-stage" aria-hidden="true"><div class="pill-3d"><span class="pill-half pill-coral"></span><span class="pill-half pill-cream"></span><i></i></div></div><h2>Amlodipine <small>5 mg</small></h2><div class="medication-time">Today · 20:00</div><button class="taken-button" id="acknowledge">Got it</button><p id="ackMessage" aria-live="polite"></p><button class="back-home" id="backHome" aria-label="Back to overview">⌂</button></section>
      </div></div></main><p class="watch-caption" id="wearableDate">Loading shared wearable data…</p>
    </section>
    <section class="insights-side" aria-labelledby="insightsTitle"><p class="eyebrow">02 / STRUCTURED UNDERSTANDING</p><div class="insights-heading"><h2 id="insightsTitle">AI Insights</h2><span class="status-pill" id="pipelineStatus">Ready</span></div><p class="section-intro">Patient words become observations, with their original evidence kept alongside them.</p><div class="pipeline-strip"><span>Voice</span><b>→</b><span>Whisper</span><b>→</b><span>Ollama</span><b>→</b><span>Shared record</span></div><div id="insightCards" class="insight-grid" aria-live="polite"><div class="empty-insights"><span>✦</span><h3>Every voice matters.</h3><p>Record a synthetic check-in to see the actual extraction here.</p></div></div><p id="saveStatus" class="save-status" aria-live="polite"></p><div id="recordDetails"></div><details class="developer-details"><summary>Developer demo input</summary><p>Use synthetic text to test the same extraction and save flow without a microphone.</p><textarea id="demoText" aria-label="Synthetic check-in text" placeholder="My neck hurts, I haven’t taken my meds."></textarea><button id="submitText">Process synthetic text</button></details></section>
  </div><footer class="demo-footer">One fictional patient. One shared dataset. Patient statements remain separate from BP and dispenser records.</footer>
</div>`
const brand = document.querySelector<HTMLAnchorElement>('.demo-header .brand')!
const brandLogo = document.createElement('img')
brandLogo.className = 'brand-logo'
brandLogo.src = careBridgeLogo
brandLogo.alt = 'Care Bridge'
brand.setAttribute('aria-label', 'Care Bridge home')
brand.replaceChildren(brandLogo, Object.assign(document.createElement('small'), { textContent: 'SCHOOL MVP · SYNTHETIC DATA' }))

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
let busy = false
let recorder: MediaRecorder | undefined
let stream: MediaStream | undefined
let chunks: Blob[] = []
let transcriber: ((audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string }>) | undefined
let selectedStat = 'restingHeartRate'
let dataset: Demo | undefined
function screen(name: string) {
  for (const view of ['home', 'voice', 'medication']) $(`${view}Screen`).hidden = view !== name
  document.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach(b => { b.classList.toggle('selected', b.dataset.screen === name); b.setAttribute('aria-selected', String(b.dataset.screen === name)) })
}
function setBusy(value: boolean) {
  busy = value
  document.querySelectorAll<HTMLButtonElement>('[data-screen], #submitText, #goVoice').forEach(b => b.disabled = value)
  $('recordButton').toggleAttribute('disabled', value)
}
function renderWearable() {
  if (!dataset) return
  const patient = dataset.patients[0]
  const day = patient.wearable[patient.wearable.length - 1]
  const values: Record<string, [string, string, string]> = {
    restingHeartRate: ['Heart rate', `${day.restingHeartRate} <small>bpm</small>`, 'Resting heart rate'],
    sleepMinutes: ['Sleep', `${Math.floor(day.sleepMinutes / 60)}h ${String(day.sleepMinutes % 60).padStart(2, '0')}m`, 'Last night'],
    activityMinutes: ['Activity', `${day.activityMinutes} <small>min</small>`, 'Active today'],
    steps: ['Steps', `${day.steps.toLocaleString()}`, 'Daily steps'],
  }
  const [label, value, detail] = values[selectedStat]
  $('statLabel').textContent = label; $('statValue').innerHTML = value; $('statDetail').textContent = detail
  $('wearableDate').textContent = `Synthetic wearable snapshot · ${day.date}`
  $('patientName').textContent = patient.name
  document.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach(b => { b.classList.toggle('active', b.dataset.stat === selectedStat); b.setAttribute('aria-pressed', String(b.dataset.stat === selectedStat)) })
}
const medLabels: Record<string, string> = {reported_taken:'Reported taken',reported_missed:'Reported missed',reported_not_yet_taken:'Not yet taken',uncertain:'Patient unsure'}
function renderInsights(record: UnifiedCheckin) {
  const cards = record.observations.filter(o => !(o.category === 'emotional_state' && o.value.missing) && !(o.category === 'symptom' && o.value.status === 'denied')).map(o => {
    let title = String(o.value.label ?? o.value.state ?? 'Context')
    let label = 'Patient-reported observation'; let icon = '✦'
    if (o.category === 'symptom') { label = o.value.status === 'resolved' ? 'Reported resolved symptom' : 'Reported symptom'; icon = '◉' }
    if (o.category === 'medication_adherence') { title = medLabels[String(o.value.state)] ?? 'Uncertain'; label = 'Medication statement · ingestion unverified'; icon = '◒' }
    if (o.category === 'confusion') { title = 'Confusion / uncertainty'; label = String(o.value.topic ?? 'Reported question'); icon = '?' }
    if (o.category === 'emotional_state') { label = 'Reported emotional state'; icon = '♡' }
    if (o.category === 'context') { title = o.code === 'context.possible_disorientation' ? 'Possible disorientation' : o.code === 'context.social_isolation' ? 'Social isolation' : 'Contact preference'; label = 'Context for clarification'; icon = '◇' }
    return `<article class="insight-card"><span class="card-icon">${icon}</span><h3>${esc(title)}</h3><p>${esc(label)}</p></article>`
  }).join('')
  $('insightCards').innerHTML = record.extractionStatus === 'failed' ? '<div class="empty-insights"><h3>Extraction unavailable</h3><p>The transcript was retained. No observations were invented.</p></div>' : cards || '<div class="empty-insights"><h3>No observations extracted</h3><p>The message is retained in the shared record.</p></div>'
  if (record.requiresHumanReview) $('insightCards').insertAdjacentHTML('beforeend', '<article class="review-card">◇ Review suggested <p>Context needs clarification; this is not a triage result.</p></article>')
  $('recordDetails').innerHTML = `<details class="developer-details"><summary>View details</summary><p><strong>Transcript</strong></p><blockquote>${esc(record.transcript)}</blockquote><p>Captured ${esc(new Date(record.timestamp).toLocaleString())} · ${esc(record.inputSource)} · AI interpretation ${esc(record.confirmationStatus)}</p><ul>${record.observations.filter(o=>o.evidence).map(o=>`<li>${esc(o.code)}: “${esc(o.evidence)}”</li>`).join('')}</ul><details><summary>Raw unified record</summary><pre>${esc(JSON.stringify(record, null, 2))}</pre></details></details>`
}
async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Request failed')
  return data
}
async function processTranscript(transcript: string, inputSource: 'microphone' | 'pasted_text', timestamp: string) {
  $('pipelineStatus').textContent = 'Extracting'
  $('saveStatus').textContent = 'Whisper transcript captured. Ollama is extracting observations…'
  let analysis: unknown
  let extractionStatus: 'complete' | 'failed' = 'complete'
  try { analysis = await jsonRequest('/api/checkins/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({transcript}) }) }
  catch { extractionStatus = 'failed' }
  $('pipelineStatus').textContent = 'Saving'
  try {
    const record: UnifiedCheckin = await jsonRequest('/api/checkins', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript,analysis,inputSource,timestamp,confirmationStatus:'unconfirmed',extractionStatus})})
    renderInsights(record)
    $('pipelineStatus').textContent = extractionStatus === 'failed' ? 'Transcript saved' : 'Saved'
    $('saveStatus').textContent = `Saved to the shared backend record. ${extractionStatus === 'failed' ? 'AI extraction failed; transcript only.' : 'AI interpretation is unconfirmed.'} Open or refresh the GP overview to see it.`
  } catch (error) {
    $('pipelineStatus').textContent = 'Save failed'
    $('saveStatus').textContent = `Not saved: ${error instanceof Error ? error.message : 'Backend unavailable'}. The captured transcript is shown below.`
    $('recordDetails').innerHTML = `<details open><summary>Captured transcript</summary><blockquote>${esc(transcript)}</blockquote></details>`
  }
}
async function transcribe(blob: Blob) {
  $('pipelineStatus').textContent = 'Transcribing'
  const context = new AudioContext()
  let audio: Float32Array
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * 16000), 16000)
    const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start()
    audio = (await offline.startRendering()).getChannelData(0)
  } finally { await context.close() }
  if (!transcriber) {
    const { env, pipeline } = await import('@xenova/transformers')
    env.allowLocalModels = false; env.useBrowserCache = true
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', { quantized: true, progress_callback: (p: {progress?:number}) => { if (p.progress) $('pipelineStatus').textContent = `Whisper ${Math.round(p.progress)}%` } }) as unknown as typeof transcriber
  }
  return (await transcriber!(audio, {return_timestamps:false,chunk_length_s:30,stride_length_s:5})).text.trim()
}
$('recordButton').addEventListener('click', async () => {
  if (recorder?.state === 'recording') { recorder.stop(); stream?.getTracks().forEach(t=>t.stop()); setBusy(true); $('voiceTitle').textContent='Message captured'; $('voiceHint').textContent='Thank you for checking in.'; $('recordButton').textContent='Captured'; $('orb').classList.remove('is-active'); return }
  if (busy) return
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { $('voiceHint').textContent='Recording is unavailable in this browser.'; return }
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:true}); chunks=[]
    const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t))
    recorder = mimeType ? new MediaRecorder(stream,{mimeType}) : new MediaRecorder(stream)
    recorder.addEventListener('dataavailable', e=>{if(e.data.size)chunks.push(e.data)})
    recorder.addEventListener('stop', async ()=> {
      const capturedAt = new Date().toISOString()
      try { const text = await transcribe(new Blob(chunks,{type:recorder?.mimeType})); if(!text)throw new Error('No speech was detected. Please record again.'); await processTranscript(text,'microphone',capturedAt) }
      catch(error) { $('voiceTitle').textContent='Please try again'; $('voiceHint').textContent='We could not transcribe your message.'; $('pipelineStatus').textContent='Transcription failed'; $('saveStatus').textContent=error instanceof Error?error.message:'Transcription unavailable; nothing saved.' }
      finally { setBusy(false); $('recordButton').hidden=true; $('again').hidden=false }
    })
    recorder.start(); busy=true; $('submitText').toggleAttribute('disabled',true); document.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach(b=>b.disabled=true)
    $('voiceTitle').textContent='Listening'; $('voiceHint').textContent='Tap stop when you are done'; $('recordButton').textContent='Stop recording'; $('orb').classList.add('is-active'); $('recordDetails').innerHTML=''; $('saveStatus').textContent=''
  } catch { stream?.getTracks().forEach(t=>t.stop()); setBusy(false); $('voiceHint').textContent='Allow microphone access and try again.' }
})
$('again').addEventListener('click',()=>{ $('again').hidden=true; $('recordButton').hidden=false; $('recordButton').textContent='Start recording'; $('voiceTitle').textContent='Ready to listen'; $('voiceHint').textContent='Tap once and speak naturally' })
document.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach(b=>b.addEventListener('click',()=>{if(!busy)screen(b.dataset.screen!)}))
document.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach(b=>b.addEventListener('click',()=>{selectedStat=b.dataset.stat!;renderWearable()}))
$('goVoice').addEventListener('click',()=>screen('voice')); $('backHome').addEventListener('click',()=>screen('home'))
$('acknowledge').addEventListener('click',()=>{ $('ackMessage').textContent='Reminder acknowledged'; $('acknowledge').textContent='Acknowledged' })
$('submitText').addEventListener('click',async()=>{ const text=$<HTMLTextAreaElement>('demoText').value.trim(); if(!text||busy)return; setBusy(true); try { await processTranscript(text,'pasted_text',new Date().toISOString()) } finally {setBusy(false)} })
jsonRequest('/api/demo').then(data=>{dataset=data;renderWearable()}).catch(()=>{ $('wearableDate').textContent='Shared dataset unavailable. Refresh when the backend is running.' })
screen('home')
