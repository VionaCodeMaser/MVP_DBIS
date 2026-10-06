import express from 'express'
import type { fetch } from 'undici'
import { getCheckins } from './checkinStore'
import { SYNTHETIC_PATIENT_ID } from './checkinTransform'
import { demoData, seedDemoCheckins } from './demoData'
import { buildReportFromData } from '../src/shared/gpReport'
export * from '../src/shared/gpReport'

export async function buildGpReport(patientId: string, _options: { fetcher?: typeof fetch } = {}) {
  const patient = demoData.patients.find(item => item.patientId === patientId)
  if (!patient) return null
  seedDemoCheckins()
  return buildReportFromData(patient, demoData.period, getCheckins(patientId))
}

export const gpReportRouter = express.Router()

gpReportRouter.get('/api/reports/gp', async (request, response) => {
  const patientId = typeof request.query.patientId === 'string' ? request.query.patientId : SYNTHETIC_PATIENT_ID
  try {
    const report = await buildGpReport(patientId)
    if (!report) {
      response.status(404).json({ error: { code: 'unknown_patient', message: 'No synthetic report data for this patient' } })
      return
    }
    response.json(report)
  } catch (error) {
    console.error('[gp-report] Report generation failed', error)
    response.status(500).json({ error: { code: 'internal', message: 'Unexpected report failure' } })
  }
})

