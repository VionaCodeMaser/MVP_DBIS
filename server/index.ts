import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { z } from 'zod'
import { createServer as createViteServer } from 'vite'
import { AnalyzeCheckinError, CheckinAnalysisSchema, analyzeCheckin } from './analyzeCheckin'
import { getCheckins, saveCheckin } from './checkinStore'
import { SYNTHETIC_PATIENT_ID, transformAnalysisToCheckin } from './checkinTransform'
import { gpReportRouter } from './gpReport'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const app = express()
const port = Number(process.env.PORT || 5173)

app.use(express.json({ limit: '20kb' }))

const CreateCheckinSchema = z.object({
  transcript: z.string().trim().min(1),
  analysis: z.unknown(),
  inputSource: z.enum(['microphone', 'pasted_text']),
  syntheticPatientId: z.string().trim().min(1).optional(),
  timestamp: z.string().datetime().optional(),
  confirmationStatus: z.literal('confirmed'),
}).strict()

app.post('/api/checkins/analyze', async (request, response) => {
  try {
    const analysis = await analyzeCheckin(request.body)
    response.status(200).json(analysis)
  } catch (error) {
    if (error instanceof AnalyzeCheckinError) {
      const status = error.code === 'invalid_output' ? 400 : error.code === 'configuration' ? 503 : error.code === 'timeout' ? 504 : 502
      response.status(status).json({ error: { code: error.code, message: error.message } })
      return
    }
    response.status(500).json({ error: { code: 'internal', message: 'Unexpected analysis failure' } })
  }
})

app.post('/api/checkins', (request, response) => {
  const input = CreateCheckinSchema.safeParse(request.body)
  if (!input.success) {
    response.status(400).json({ error: { code: 'invalid_checkin', message: input.error.issues[0]?.message || 'Invalid check-in' } })
    return
  }
  const analysis = CheckinAnalysisSchema.safeParse(input.data.analysis)
  if (!analysis.success) {
    response.status(400).json({ error: { code: 'invalid_analysis', message: 'The confirmed analysis does not match the V4 schema' } })
    return
  }
  const checkin = transformAnalysisToCheckin({
    analysis: analysis.data,
    transcript: input.data.transcript,
    inputSource: input.data.inputSource,
    syntheticPatientId: input.data.syntheticPatientId || SYNTHETIC_PATIENT_ID,
    timestamp: input.data.timestamp,
    confirmationStatus: input.data.confirmationStatus,
  })
  response.status(201).json(saveCheckin(checkin))
})

app.get('/api/checkins', (request, response) => {
  const patientId = typeof request.query.patientId === 'string' ? request.query.patientId : SYNTHETIC_PATIENT_ID
  response.json({ syntheticPatientId: patientId, checkins: getCheckins(patientId) })
})

app.use(gpReportRouter)

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')))
  app.get('*', (_request, response) => response.sendFile(path.join(root, 'dist', 'index.html')))
} else {
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
}

app.listen(port, () => {
  console.log(`Voice Health Check-in MVP running at http://127.0.0.1:${port}`)
})
