import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { fetch } from 'undici'
import type { UnifiedCheckin } from '../src/shared/checkin'
import { getCheckins } from './checkinStore'
import { SYNTHETIC_PATIENT_ID, countDistinctSymptomDays } from './checkinTransform'
import { summarize } from './gpReportSummary'

// Demonstration values only, not clinical thresholds. The care team should set these.
export const GP_REPORT_CONFIG = {
  systolicTarget: 140,
  diastolicTarget: 90,
  aboveTargetShare: 0.3,
  risingTrendMmHg: 5,
  recurringSymptomDays: 3,
  dispenserMissedMin: 1,
}

export type GpReportConfig = typeof GP_REPORT_CONFIG

export type BloodPressureReading = { timestamp: string; systolic: number; diastolic: number }
export type DispenserEvent = { scheduledAt: string; medication: string; status: 'dispensed' | 'missed' }
export type ReportPeriod = { from: string; to: string }

export type PatientReportData = {
  patientId: string
  period: ReportPeriod
  bloodPressure: BloodPressureReading[]
  dispenser: DispenserEvent[]
  checkins: UnifiedCheckin[]
}

export type ReportFlag = { code: string; message: string }

export type GpReportMetrics = ReturnType<typeof computeMetrics>

const DAY_MS = 86_400_000
const dateOf = (timestamp: string) => timestamp.slice(0, 10)
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10)

function average(values: number[]) {
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function listDates(period: ReportPeriod) {
  const days = Math.round((Date.parse(period.to) - Date.parse(period.from)) / DAY_MS) + 1
  return Array.from({ length: days }, (_, index) => addDays(period.from, index))
}

export function computeMetrics(data: PatientReportData, config: GpReportConfig = GP_REPORT_CONFIG) {
  const dates = listDates(data.period)
  const inPeriod = (timestamp: string) => dateOf(timestamp) >= data.period.from && dateOf(timestamp) <= data.period.to
  const midDate = dates[Math.ceil(dates.length / 2)] ?? data.period.to

  const readings = data.bloodPressure.filter((reading) => inPeriod(reading.timestamp))
  const firstHalf = readings.filter((reading) => dateOf(reading.timestamp) < midDate)
  const secondHalf = readings.filter((reading) => dateOf(reading.timestamp) >= midDate)
  const systolic = readings.map((reading) => reading.systolic)

  const dispenser = data.dispenser.filter((event) => inPeriod(event.scheduledAt))
  const dispenserByDate = new Map(dispenser.map((event) => [dateOf(event.scheduledAt), event.status]))
  const missedDates = dispenser.filter((event) => event.status === 'missed').map((event) => dateOf(event.scheduledAt))

  const periodCheckins = data.checkins.filter((checkin) => inPeriod(checkin.timestamp))
  const confirmed = periodCheckins.filter((checkin) => checkin.confirmationStatus === 'confirmed')
  const symptomLabels = new Map<string, string>()
  confirmed.forEach((checkin) => checkin.observations
    .filter((item) => item.category === 'symptom' && item.value.status !== 'denied')
    .forEach((item) => symptomLabels.set(item.code, String(item.value.label ?? item.code))))

  const medicationReports = confirmed.flatMap((checkin) => checkin.observations
    .filter((item) => item.category === 'medication_adherence')
    .map((item) => ({ date: dateOf(checkin.timestamp), state: String(item.value.state), evidence: item.evidence })))

  return {
    period: { ...data.period, days: dates.length },
    bloodPressure: {
      readings: readings.length,
      daysWithoutReading: dates.length - new Set(readings.map((reading) => dateOf(reading.timestamp))).size,
      averageSystolic: average(systolic),
      averageDiastolic: average(readings.map((reading) => reading.diastolic)),
      minSystolic: systolic.length ? Math.min(...systolic) : null,
      maxSystolic: systolic.length ? Math.max(...systolic) : null,
      firstHalfAverageSystolic: average(firstHalf.map((reading) => reading.systolic)),
      secondHalfAverageSystolic: average(secondHalf.map((reading) => reading.systolic)),
      aboveTargetCount: readings.filter((reading) => reading.systolic >= config.systolicTarget || reading.diastolic >= config.diastolicTarget).length,
    },
    dispenser: {
      scheduled: dispenser.length,
      dispensed: dispenser.filter((event) => event.status === 'dispensed').length,
      missed: missedDates.length,
      missedDates,
    },
    checkins: {
      confirmed: confirmed.length,
      excludedUnconfirmed: periodCheckins.length - confirmed.length,
      symptomDays: [...symptomLabels].map(([code, label]) => ({ code, label, days: countDistinctSymptomDays(confirmed, code) })),
      reviewItems: confirmed
        .filter((checkin) => checkin.requiresHumanReview)
        .map((checkin) => ({
          date: dateOf(checkin.timestamp),
          evidence: checkin.observations.filter((item) => item.category === 'context' && item.evidence).map((item) => item.evidence as string),
        })),
      medicationReports,
    },
    medicationMismatches: medicationReports
      .filter((report) => (report.state === 'reported_taken' && dispenserByDate.get(report.date) === 'missed')
        || (report.state === 'reported_missed' && dispenserByDate.get(report.date) === 'dispensed'))
      .map((report) => ({ date: report.date, patientReport: report.state, dispenserStatus: dispenserByDate.get(report.date) })),
  }
}

export function computeFlags(metrics: GpReportMetrics, config: GpReportConfig = GP_REPORT_CONFIG): ReportFlag[] {
  const flags: ReportFlag[] = []
  const bp = metrics.bloodPressure

  if (bp.readings > 0 && bp.aboveTargetCount / bp.readings >= config.aboveTargetShare) {
    flags.push({
      code: 'bp.above_target',
      message: `${bp.aboveTargetCount} of ${bp.readings} readings at or above the configured demo target ${config.systolicTarget}/${config.diastolicTarget} mmHg`,
    })
  }
  if (bp.firstHalfAverageSystolic !== null && bp.secondHalfAverageSystolic !== null
    && bp.secondHalfAverageSystolic - bp.firstHalfAverageSystolic >= config.risingTrendMmHg) {
    flags.push({
      code: 'bp.rising_trend',
      message: `Average systolic rose from ${bp.firstHalfAverageSystolic} to ${bp.secondHalfAverageSystolic} mmHg between the first and second half of the period`,
    })
  }
  if (metrics.dispenser.missed >= config.dispenserMissedMin) {
    flags.push({
      code: 'medication.dispenser_missed',
      message: `Dispenser recorded ${metrics.dispenser.missed} missed dose(s): ${metrics.dispenser.missedDates.join(', ')}`,
    })
  }
  if (metrics.medicationMismatches.length) {
    flags.push({
      code: 'medication.report_dispenser_mismatch',
      message: `Patient report and dispenser disagree on ${metrics.medicationMismatches.map((item) => `${item.date} (patient: ${item.patientReport}, dispenser: ${item.dispenserStatus})`).join(', ')}`,
    })
  }
  metrics.checkins.symptomDays
    .filter((symptom) => symptom.days >= config.recurringSymptomDays)
    .forEach((symptom) => flags.push({ code: 'symptom.recurring', message: `${symptom.label} reported on ${symptom.days} days` }))
  if (metrics.checkins.reviewItems.length) {
    flags.push({
      code: 'checkin.requires_review',
      message: `${metrics.checkins.reviewItems.length} check-in(s) marked for clarification (not a triage result)`,
    })
  }
  return flags
}

type SyntheticReportFile = {
  period: ReportPeriod
  patients: Omit<PatientReportData, 'period'>[]
}

const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'syntheticReportData.json')

function loadPatientData(patientId: string): PatientReportData | null {
  const file = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as SyntheticReportFile
  const patient = file.patients.find((item) => item.patientId === patientId)
  if (!patient) return null
  const fixtureIds = new Set(patient.checkins.map((checkin) => checkin.id))
  const stored = getCheckins(patientId).filter((checkin) => !fixtureIds.has(checkin.id))
  return { ...patient, period: file.period, checkins: [...patient.checkins, ...stored] }
}

export async function buildGpReport(patientId: string, options: { fetcher?: typeof fetch } = {}) {
  const data = loadPatientData(patientId)
  if (!data) return null
  const metrics = computeMetrics(data)
  const flags = computeFlags(metrics)
  const daily = listDates(data.period).map((date) => {
    const reading = data.bloodPressure.find((item) => dateOf(item.timestamp) === date)
    const dispense = data.dispenser.find((item) => dateOf(item.scheduledAt) === date)
    return { date, systolic: reading?.systolic ?? null, diastolic: reading?.diastolic ?? null, dispenser: dispense?.status ?? null }
  })
  return {
    schemaVersion: 'gp-report.v1',
    syntheticPatientId: patientId,
    generatedAt: new Date().toISOString(),
    config: GP_REPORT_CONFIG,
    metrics,
    flags,
    daily,
    summary: await summarize(metrics, flags, options.fetcher),
  }
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
