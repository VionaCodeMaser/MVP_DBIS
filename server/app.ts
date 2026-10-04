import express from 'express'
import { z } from 'zod'
import { AnalyzeCheckinError, CheckinAnalysisSchema, analyzeCheckin } from './analyzeCheckin'
import { getCheckins, saveCheckin } from './checkinStore'
import { SYNTHETIC_PATIENT_ID, createCapturedCheckin, transformAnalysisToCheckin } from './checkinTransform'
import { gpReportRouter } from './gpReport'
import { demoData, seedDemoCheckins } from './demoData'

export const app = express()

seedDemoCheckins()
app.get('/api/demo', (_request, response) => response.json(demoData))

app.use(express.json({ limit: '20kb' }))

const CreateCheckinSchema = z.object({
  transcript: z.string().trim().min(1),
  analysis: z.unknown(),
  inputSource: z.enum(['microphone', 'pasted_text']),
  syntheticPatientId: z.string().trim().min(1).optional(),
  timestamp: z.string().datetime().optional(),
  confirmationStatus: z.enum(['confirmed', 'unconfirmed']).default('unconfirmed'),
  extractionStatus: z.enum(['complete', 'failed']).default('complete'),
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
  if (input.data.syntheticPatientId && input.data.syntheticPatientId !== SYNTHETIC_PATIENT_ID) {
    response.status(400).json({ error: { message: 'This demo supports one synthetic patient' } })
    return
  }
  if (input.data.extractionStatus === 'failed') {
    if (input.data.analysis !== undefined) {
      response.status(400).json({ error: { message: 'Failed extraction cannot include an analysis' } })
      return
    }
    const checkin = createCapturedCheckin({ ...input.data, syntheticPatientId: SYNTHETIC_PATIENT_ID })
    response.status(201).json(saveCheckin(checkin))
    return
  }
  const analysis = CheckinAnalysisSchema.safeParse(input.data.analysis)
  if (!analysis.success) {
    response.status(400).json({ error: { code: 'invalid_analysis', message: 'The analysis does not match the V4 schema' } })
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

