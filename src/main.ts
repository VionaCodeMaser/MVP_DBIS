import './style.css'
import { env, pipeline } from '@xenova/transformers'
import { isMedicationAdherence } from './shared/checkin'
import type { CheckinAnalysis } from './shared/checkin'

type Transcriber = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string }>

env.allowLocalModels = false
env.useBrowserCache = true

type RecorderState = 'ready' | 'recording' | 'loading' | 'transcribing' | 'done' | 'analyzing' | 'analyzed' | 'saved' | 'error'

type TranscriptionRecord = {
  schemaVersion: 'health-check-in.transcription.v1'
  id: string
  createdAt: string
  language: 'auto'
  source: {
    type: 'microphone' | 'pasted_text'
    mimeType: string
    sampleRateHz: 16000
  }
  transcription: {
    text: string
    segments: []
  }
  analysis: CheckinAnalysis | null
}

const app = document.querySelector<HTMLDivElement>('#app')!
let recorder: MediaRecorder | undefined
let audioStream: MediaStream | undefined
let audioChunks: Blob[] = []
let transcriber: Transcriber | undefined
let state: RecorderState = 'ready'
let recordingStartedAt = 0
let timerId: number | undefined
let latestRecord: TranscriptionRecord | undefined
let analysisDraft: CheckinAnalysis | undefined

const microphoneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>'
const stopIcon = '<span class="stop-icon" aria-hidden="true"></span>'
const heartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>'
const homeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>'
const checkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'
const calendarIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>'

type WatchScreenView = 'home' | 'voice' | 'medication'
type WearableStat = 'heart' | 'sleep' | 'activity' | 'steps'

const wearableStats: Record<WearableStat, { label: string; value: string; unit: string; detail: string; symbol: string }> = {
  heart: { label: 'Heart rate', value: '72', unit: 'bpm', detail: 'Resting heart rate', symbol: '&#9829;' },
  sleep: { label: 'Sleep', value: '7h 12', unit: '', detail: 'Last night', symbol: 'Zz' },
  activity: { label: 'Activity', value: '34', unit: 'min', detail: 'Active today', symbol: '&#8599;' },
  steps: { label: 'Steps', value: '5,840', unit: '', detail: 'Of 8,000 goal', symbol: '&#8226;&#8226;' },
}

app.innerHTML = `
  <div class="screen-picker" role="tablist" aria-label="Watch screens">
    <button type="button" class="selected" data-screen="home" role="tab" aria-selected="true">Daily overview</button>
    <button type="button" data-screen="voice" role="tab" aria-selected="false">Voice check-in</button>
    <button type="button" data-screen="medication" role="tab" aria-selected="false">Medication</button>
  </div>
  <main class="watch-shell">
    <div class="watch-frame">
      <div class="watch-screen">
        <section id="homeScreen" class="watch-home-screen">
          <div class="watch-status"><span>09:41</span>${heartIcon}</div>
          <div class="watch-greeting"><p>Good morning,</p><h2>Elena</h2></div>
          <div class="watch-stat-card" aria-live="polite">
            <span class="stat-card-label" id="statCardLabel">Heart rate</span>
            <div class="stat-card-value" id="statCardValue">72 <small>bpm</small></div>
            <span class="stat-card-detail" id="statCardDetail">Resting heart rate</span>
          </div>
          <div class="stat-bubble-menu" aria-label="Choose a health overview">
            <button type="button" class="active" data-stat="heart" aria-label="Heart rate"><span>&#9829;</span></button>
            <button type="button" data-stat="sleep" aria-label="Sleep"><span>Zz</span></button>
            <button type="button" data-stat="activity" aria-label="Activity"><span>&#8599;</span></button>
            <button type="button" data-stat="steps" aria-label="Steps"><span>&#8226;&#8226;</span></button>
          </div>
          <button class="checkin-button" id="goToVoiceButton" type="button">${microphoneIcon} How do you feel?</button>
        </section>

        <section class="recorder-screen" id="voiceScreen" aria-labelledby="screenTitle" hidden>
          <div class="screen-topline"><span class="screen-time">09:18</span><span class="screen-dot" aria-label="Ready"></span></div>
          <div class="mic-orb" id="micOrb">${microphoneIcon}</div>
          <div class="screen-copy">
            <h1 id="screenTitle">Ready to listen</h1>
            <p id="screenHint">Tap once and speak naturally</p>
          </div>
          <button class="record-button" id="recordButton" type="button" aria-label="Start recording">
            <span class="record-icon" id="recordIcon">${microphoneIcon}</span>
            <span id="recordLabel">Start recording</span>
          </button>
          <button class="paste-button" id="pasteButton" type="button">Paste text instead</button>
          <div class="progress-wrap" id="progressWrap" hidden aria-live="polite">
            <div class="progress-meta"><span id="progressLabel">Loading Whisper</span><strong id="progressValue">0%</strong></div>
            <div class="progress-track" role="progressbar" aria-label="Transcription loading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="progressBar"></span></div>
          </div>
          <div class="transcript-card" id="transcriptCard" hidden>
            <label class="transcript-label" for="transcriptInput">Your words</label>
            <textarea id="transcriptInput" rows="3" aria-label="Edit your transcript"></textarea>
            <button class="analyze-button" id="analyzeButton" type="button">Analyze check-in</button>
            <button class="copy-json-button" id="copyJsonButton" type="button">Copy JSON</button>
          </div>
          <div class="analysis-card" id="analysisCard" hidden>
            <div class="analysis-heading"><span class="transcript-label">AI summary</span><span id="analysisStatus">Review</span></div>
            <pre class="json-viewer" id="jsonViewer" aria-label="Check-in JSON output"></pre>
            <div id="symptomsList"></div>
            <button class="add-symptom-button" id="addSymptomButton" type="button">+ Add symptom</button>
            <div class="confusion-fields">
              <label class="check-row"><input id="confusionDetected" type="checkbox"><span>Confusion or uncertainty</span></label>
              <input id="confusionTopic" type="text" placeholder="Topic" aria-label="Confusion topic">
              <textarea id="confusionEvidence" rows="2" placeholder="Evidence phrase" aria-label="Confusion evidence"></textarea>
            </div>
            <div class="patient-fields">
              <label>Emotional state<input id="emotionalState" type="text" aria-label="Emotional state"></label>
              <label>Medication adherence<select id="medicationAdherence" aria-label="Medication adherence"><option value="reported_taken">Reported taken</option><option value="reported_missed">Reported missed</option><option value="reported_not_yet_taken">Not yet taken</option><option value="uncertain">Uncertain</option><option value="not_mentioned">Not mentioned</option></select></label>
            </div>
            <button class="confirm-button" id="confirmButton" type="button">Confirm &amp; save</button>
          </div>
          <p class="analysis-error" id="analysisError" role="alert" hidden></p>
          <button class="retry-button" id="retryButton" type="button" hidden>Record again</button>
        </section>

        <section id="medicationScreen" class="medication-screen" hidden>
          <div class="watch-status"><span>09:41</span>${heartIcon}</div>
          <div class="pill-stage" aria-hidden="true">
            <div class="pill-3d"><span class="pill-half pill-coral"></span><span class="pill-half pill-cream"></span><i></i></div>
          </div>
          <h2>Amlodipine <small>5 mg</small></h2>
          <div class="medication-time">${calendarIcon} 20:00</div>
          <button class="taken-button" id="takenButton" type="button"><span>${checkIcon}</span> Taken</button>
          <button class="back-home" id="medicationBackButton" type="button" aria-label="Back to overview">${homeIcon}</button>
        </section>
      </div>
    </div>
  </main>
`

const recordButton = document.querySelector<HTMLButtonElement>('#recordButton')!
const pasteButton = document.querySelector<HTMLButtonElement>('#pasteButton')!
const recordIcon = document.querySelector<HTMLSpanElement>('#recordIcon')!
const recordLabel = document.querySelector<HTMLSpanElement>('#recordLabel')!
const screenTitle = document.querySelector<HTMLHeadingElement>('#screenTitle')!
const screenHint = document.querySelector<HTMLParagraphElement>('#screenHint')!
const screenDot = document.querySelector<HTMLSpanElement>('.screen-dot')!
const micOrb = document.querySelector<HTMLDivElement>('#micOrb')!
const transcriptCard = document.querySelector<HTMLDivElement>('#transcriptCard')!
const transcriptInput = document.querySelector<HTMLTextAreaElement>('#transcriptInput')!
const analyzeButton = document.querySelector<HTMLButtonElement>('#analyzeButton')!
const analysisCard = document.querySelector<HTMLDivElement>('#analysisCard')!
const jsonViewer = document.querySelector<HTMLPreElement>('#jsonViewer')!
const symptomsList = document.querySelector<HTMLDivElement>('#symptomsList')!
const addSymptomButton = document.querySelector<HTMLButtonElement>('#addSymptomButton')!
const confusionDetected = document.querySelector<HTMLInputElement>('#confusionDetected')!
const confusionTopic = document.querySelector<HTMLInputElement>('#confusionTopic')!
const confusionEvidence = document.querySelector<HTMLTextAreaElement>('#confusionEvidence')!
const emotionalState = document.querySelector<HTMLInputElement>('#emotionalState')!
const medicationAdherence = document.querySelector<HTMLSelectElement>('#medicationAdherence')!
const confirmButton = document.querySelector<HTMLButtonElement>('#confirmButton')!
const analysisError = document.querySelector<HTMLParagraphElement>('#analysisError')!
const retryButton = document.querySelector<HTMLButtonElement>('#retryButton')!
const progressWrap = document.querySelector<HTMLDivElement>('#progressWrap')!
const progressLabel = document.querySelector<HTMLSpanElement>('#progressLabel')!
const progressValue = document.querySelector<HTMLElement>('#progressValue')!
const progressBar = document.querySelector<HTMLSpanElement>('#progressBar')!
const progressTrack = document.querySelector<HTMLDivElement>('.progress-track')!
const copyJsonButton = document.querySelector<HTMLButtonElement>('#copyJsonButton')!
const screenPickerButtons = document.querySelectorAll<HTMLButtonElement>('.screen-picker button')
const homeScreen = document.querySelector<HTMLElement>('#homeScreen')!
const voiceScreen = document.querySelector<HTMLElement>('#voiceScreen')!
const medicationScreen = document.querySelector<HTMLElement>('#medicationScreen')!
const goToVoiceButton = document.querySelector<HTMLButtonElement>('#goToVoiceButton')!
const takenButton = document.querySelector<HTMLButtonElement>('#takenButton')!
const medicationBackButton = document.querySelector<HTMLButtonElement>('#medicationBackButton')!
const statCardLabel = document.querySelector<HTMLSpanElement>('#statCardLabel')!
const statCardValue = document.querySelector<HTMLDivElement>('#statCardValue')!
const statCardDetail = document.querySelector<HTMLSpanElement>('#statCardDetail')!
const statBubbleButtons = document.querySelectorAll<HTMLButtonElement>('.stat-bubble-menu button')
let screen: WatchScreenView = 'home'
let activeStat: WearableStat = 'heart'

function renderStatCard() {
  const stat = wearableStats[activeStat]
  statCardLabel.textContent = stat.label
  statCardValue.innerHTML = `${stat.value}${stat.unit ? ` <small>${stat.unit}</small>` : ''}`
  statCardDetail.textContent = stat.detail
  statBubbleButtons.forEach((button) => button.classList.toggle('active', button.dataset.stat === activeStat))
}

function setScreen(next: WatchScreenView) {
  // Avoid abandoning an in-progress recording or analysis when switching screens.
  if (next !== 'voice' && ['recording', 'loading', 'transcribing', 'analyzing'].includes(state)) return
  screen = next
  homeScreen.hidden = next !== 'home'
  voiceScreen.hidden = next !== 'voice'
  medicationScreen.hidden = next !== 'medication'
  screenPickerButtons.forEach((button) => {
    const isSelected = button.dataset.screen === next
    button.classList.toggle('selected', isSelected)
    button.setAttribute('aria-selected', String(isSelected))
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character)
}

function cloneAnalysis(value: CheckinAnalysis): CheckinAnalysis {
  return JSON.parse(JSON.stringify(value)) as CheckinAnalysis
}

function renderJsonViewer() {
  if (!latestRecord) {
    jsonViewer.textContent = ''
    return
  }
  const output = {
    ...latestRecord,
    analysis: analysisDraft ? cloneAnalysis(analysisDraft) : latestRecord.analysis,
  }
  jsonViewer.textContent = JSON.stringify(output, null, 2)
}

function isCheckinAnalysis(value: unknown): value is CheckinAnalysis {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CheckinAnalysis>
  return Array.isArray(candidate.symptoms)
    && Boolean(candidate.confusion)
    && typeof candidate.confusion?.detected === 'boolean'
    && typeof candidate.emotionalState === 'string'
    && isMedicationAdherence(candidate.medicationAdherence)
}

function setProgress(value: number, label = 'Loading Whisper') {
  const safeValue = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)))
  progressLabel.textContent = label
  progressValue.textContent = `${safeValue}%`
  progressBar.style.width = `${safeValue}%`
  progressTrack.setAttribute('aria-valuenow', String(safeValue))
}

function setState(nextState: RecorderState, message?: string) {
  state = nextState
  document.body.dataset.state = nextState
  recordButton.disabled = ['loading', 'transcribing', 'analyzing'].includes(nextState)
  pasteButton.hidden = nextState !== 'ready'
  analyzeButton.disabled = nextState === 'analyzing'
  confirmButton.disabled = nextState === 'saved'
  retryButton.hidden = !['done', 'analyzed', 'saved', 'error'].includes(nextState)
  transcriptCard.hidden = !['done', 'analyzing', 'analyzed', 'saved'].includes(nextState)
  analysisCard.hidden = !['analyzed', 'saved'].includes(nextState)
  analysisError.hidden = true
  progressWrap.hidden = !['loading', 'transcribing'].includes(nextState)
  micOrb.classList.toggle('is-active', nextState === 'recording')
  screenDot.classList.toggle('is-active', nextState === 'recording')
  const busy = ['recording', 'loading', 'transcribing', 'analyzing'].includes(nextState)
  screenPickerButtons.forEach((button) => { if (button.dataset.screen !== 'voice') button.disabled = busy })

  if (nextState === 'ready') {
    screenTitle.textContent = 'Ready to listen'
    screenHint.textContent = 'Tap once and speak naturally'
    recordLabel.textContent = 'Start recording'
    recordIcon.innerHTML = microphoneIcon
    recordButton.setAttribute('aria-label', 'Start recording')
    setProgress(0)
  }

  if (nextState === 'recording') {
    screenTitle.textContent = 'Listening'
    screenHint.textContent = 'Tap stop when you are done'
    recordLabel.textContent = 'Stop recording'
    recordIcon.innerHTML = stopIcon
    recordButton.setAttribute('aria-label', 'Stop recording')
  }

  if (nextState === 'loading') {
    screenTitle.textContent = 'Getting ready'
    screenHint.textContent = message || 'Preparing speech recognition'
    recordLabel.textContent = 'Please wait'
    recordIcon.innerHTML = '<span class="loading-icon"></span>'
    setProgress(0, message || 'Loading Whisper')
  }

  if (nextState === 'transcribing') {
    screenTitle.textContent = 'Transcribing'
    screenHint.textContent = message || 'Your words are being written down'
    recordLabel.textContent = 'Working'
    recordIcon.innerHTML = '<span class="loading-icon"></span>'
    setProgress(100, message || 'Transcribing audio')
  }

  if (nextState === 'done') {
    screenTitle.textContent = 'Review your words'
    screenHint.textContent = message || 'Correct the transcript before analysis'
    recordLabel.textContent = 'Record again'
    recordIcon.innerHTML = microphoneIcon
    recordButton.setAttribute('aria-label', 'Record again')
  }

  if (nextState === 'analyzing') {
    screenTitle.textContent = 'Analyzing'
    screenHint.textContent = message || 'Finding symptoms and confusion'
    recordLabel.textContent = 'Working'
    recordIcon.innerHTML = '<span class="loading-icon"></span>'
  }

  if (nextState === 'analyzed') {
    screenTitle.textContent = 'Review analysis'
    screenHint.textContent = 'Correct or remove anything before saving'
    recordLabel.textContent = 'Record again'
    recordIcon.innerHTML = microphoneIcon
  }

  if (nextState === 'saved') {
    screenTitle.textContent = 'Saved'
    screenHint.textContent = 'Your confirmed check-in is ready'
    recordLabel.textContent = 'Record again'
    recordIcon.innerHTML = microphoneIcon
    confirmButton.textContent = 'Confirmed & saved'
  }

  if (nextState === 'error') {
    screenTitle.textContent = 'Try again'
    screenHint.textContent = message || 'The recording could not be transcribed'
    recordLabel.textContent = 'Start again'
    recordIcon.innerHTML = microphoneIcon
    recordButton.setAttribute('aria-label', 'Start recording again')
  }
}

function updateTimer() {
  const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000)
  screenHint.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}  ·  Tap stop when done`
}

function makeTranscriptionRecord(text: string, mimeType: string, sourceType: 'microphone' | 'pasted_text' = 'microphone'): TranscriptionRecord {
  return {
    schemaVersion: 'health-check-in.transcription.v1',
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    language: 'auto',
    source: { type: sourceType, mimeType, sampleRateHz: 16000 },
    transcription: { text, segments: [] },
    analysis: null,
  }
}

function renderAnalysis() {
  if (!analysisDraft) return
  symptomsList.innerHTML = analysisDraft.symptoms.length
    ? analysisDraft.symptoms.map((symptom, index) => `
      <div class="symptom-row" data-index="${index}">
        <input class="analysis-input" data-field="label" type="text" value="${escapeHtml(symptom.label)}" aria-label="Symptom label">
        <textarea class="analysis-input" data-field="evidence" rows="2" aria-label="Symptom evidence">${escapeHtml(symptom.evidence)}</textarea>
        <button class="remove-symptom-button" data-remove-symptom="${index}" type="button" aria-label="Remove symptom">Remove</button>
      </div>`).join('')
    : '<p class="no-symptoms">No symptoms found. Add one if the transcript mentions a symptom.</p>'
  confusionDetected.checked = analysisDraft.confusion.detected
  confusionTopic.value = analysisDraft.confusion.topic || ''
  confusionEvidence.value = analysisDraft.confusion.evidence || ''
  emotionalState.value = analysisDraft.emotionalState
  medicationAdherence.value = analysisDraft.medicationAdherence
  confusionTopic.disabled = !analysisDraft.confusion.detected
  confusionEvidence.disabled = !analysisDraft.confusion.detected
  renderJsonViewer()
}

function showAnalysisError(message: string) {
  analysisError.textContent = message
  analysisError.hidden = false
}

async function analyzeTranscript() {
  const transcript = transcriptInput.value.trim()
  if (!transcript) {
    showAnalysisError('Add some words before analyzing the check-in.')
    return
  }
  if (!latestRecord) latestRecord = makeTranscriptionRecord(transcript, 'text/plain', 'pasted_text')
  latestRecord.transcription.text = transcript
  renderJsonViewer()
  setState('analyzing', 'Finding symptoms and confusion')
  try {
    const response = await fetch('/api/checkins/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    })
    const payload: unknown = await response.json()
    if (!response.ok) {
      const errorMessage = typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'object' && payload.error && 'message' in payload.error
        ? String(payload.error.message)
        : 'Analysis failed'
      throw new Error(errorMessage)
    }
    if (!isCheckinAnalysis(payload)) throw new Error('Analysis returned an invalid response')
    analysisDraft = cloneAnalysis(payload)
    renderAnalysis()
    setState('analyzed')
  } catch (error) {
    setState('done')
    showAnalysisError(error instanceof Error ? error.message : 'Analysis failed. Nothing was saved.')
  }
}

function syncDraftFromInputs() {
  if (!analysisDraft) return
  document.querySelectorAll<HTMLElement>('.symptom-row').forEach((row) => {
    const index = Number(row.dataset.index)
    const label = row.querySelector<HTMLInputElement>('[data-field="label"]')?.value.trim()
    const evidence = row.querySelector<HTMLTextAreaElement>('[data-field="evidence"]')?.value.trim()
    if (label && evidence && analysisDraft) analysisDraft.symptoms[index] = { label, evidence }
  })
  analysisDraft.confusion = {
    detected: confusionDetected.checked,
    topic: confusionDetected.checked ? confusionTopic.value.trim() || null : null,
    evidence: confusionDetected.checked ? confusionEvidence.value.trim() || null : null,
  }
  analysisDraft.emotionalState = emotionalState.value.trim() || 'not_stated'
  analysisDraft.medicationAdherence = medicationAdherence.value as CheckinAnalysis['medicationAdherence']
}

function getRecordingMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setState('error', 'This browser cannot record audio')
    return
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    const mimeType = getRecordingMimeType()
    recorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream)
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) audioChunks.push(event.data)
    })
    recorder.addEventListener('stop', () => void finishRecording())
    recorder.start()
    recordingStartedAt = Date.now()
    timerId = window.setInterval(updateTimer, 1000)
    setState('recording')
  } catch {
    setState('error', 'Microphone permission is needed')
  }
}

function stopRecording() {
  if (!recorder || recorder.state === 'inactive') return
  recorder.stop()
  audioStream?.getTracks().forEach((track) => track.stop())
  if (timerId) window.clearInterval(timerId)
  timerId = undefined
  setState('transcribing', 'Preparing your recording')
}

async function decodeTo16kAudio(blob: Blob) {
  const audioContext = new AudioContext()
  const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer())
  const targetLength = Math.ceil(decoded.duration * 16000)
  const offlineContext = new OfflineAudioContext(1, targetLength, 16000)
  const source = offlineContext.createBufferSource()
  source.buffer = decoded
  source.connect(offlineContext.destination)
  source.start()
  const rendered = await offlineContext.startRendering()
  await audioContext.close()
  return rendered.getChannelData(0)
}

async function getTranscriber() {
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
      quantized: true,
      progress_callback: (progress: { status?: string; progress?: number }) => {
        if (progress.status === 'progress' && typeof progress.progress === 'number') {
          setProgress(progress.progress, 'Loading Whisper')
        }
      },
    }) as unknown as Transcriber
  }
  return transcriber
}

async function finishRecording() {
  try {
    const blob = new Blob(audioChunks, { type: recorder?.mimeType || 'audio/webm' })
    setState('loading', 'Loading Whisper')
    const audio = await decodeTo16kAudio(blob)
    const recognize = await getTranscriber()
    setState('transcribing')
    const result = await recognize(audio, {
      return_timestamps: false,
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    const text = result.text.trim() || 'No speech was detected.'
    latestRecord = makeTranscriptionRecord(text, blob.type)
    transcriptInput.value = text
    app.dataset.transcriptionJson = JSON.stringify(latestRecord)
    window.dispatchEvent(new CustomEvent('health-transcription-ready', { detail: latestRecord }))
    setState('done')
  } catch (error) {
    console.error(error)
    setState('error', 'Please try a shorter recording')
  }
}

function reset() {
  transcriptInput.value = ''
  latestRecord = undefined
  analysisDraft = undefined
  symptomsList.innerHTML = ''
  confirmButton.textContent = 'Confirm & save'
  delete app.dataset.transcriptionJson
  renderJsonViewer()
  audioChunks = []
  recorder = undefined
  setState('ready')
}

function openPastedText() {
  latestRecord = makeTranscriptionRecord('', 'text/plain', 'pasted_text')
  analysisDraft = undefined
  transcriptInput.value = ''
  renderJsonViewer()
  setState('done', 'Paste or type your check-in below')
  transcriptInput.focus()
}

recordButton.addEventListener('click', () => {
  if (state === 'recording') stopRecording()
  else if (['done', 'analyzed', 'saved', 'error'].includes(state)) reset()
  else if (state === 'ready') void startRecording()
})
retryButton.addEventListener('click', reset)
pasteButton.addEventListener('click', openPastedText)
screenPickerButtons.forEach((button) => button.addEventListener('click', () => setScreen(button.dataset.screen as WatchScreenView)))
goToVoiceButton.addEventListener('click', () => setScreen('voice'))
takenButton.addEventListener('click', () => setScreen('home'))
medicationBackButton.addEventListener('click', () => setScreen('home'))
statBubbleButtons.forEach((button) => button.addEventListener('click', () => {
  activeStat = button.dataset.stat as WearableStat
  renderStatCard()
}))
analyzeButton.addEventListener('click', () => void analyzeTranscript())
addSymptomButton.addEventListener('click', () => {
  if (!analysisDraft) return
  syncDraftFromInputs()
  analysisDraft.symptoms.push({ label: '', evidence: '' })
  renderAnalysis()
})
symptomsList.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const button = target.closest<HTMLButtonElement>('[data-remove-symptom]')
  if (!button || !analysisDraft) return
  syncDraftFromInputs()
  analysisDraft.symptoms.splice(Number(button.dataset.removeSymptom), 1)
  renderAnalysis()
})
confusionDetected.addEventListener('change', () => {
  syncDraftFromInputs()
  renderAnalysis()
})
confusionTopic.addEventListener('input', syncDraftFromInputs)
confusionEvidence.addEventListener('input', syncDraftFromInputs)
confirmButton.addEventListener('click', () => {
  if (!analysisDraft || !latestRecord) return
  syncDraftFromInputs()
  latestRecord.analysis = cloneAnalysis(analysisDraft)
  app.dataset.transcriptionJson = JSON.stringify(latestRecord)
  renderJsonViewer()
  setState('saved')
})
copyJsonButton.addEventListener('click', async () => {
  if (!latestRecord) return
  const json = jsonViewer.textContent || JSON.stringify(latestRecord, null, 2)
  await navigator.clipboard.writeText(json)
  copyJsonButton.textContent = 'JSON copied'
  window.setTimeout(() => { copyJsonButton.textContent = 'Copy JSON' }, 1800)
})

setState('ready')
renderStatCard()
setScreen('home')
