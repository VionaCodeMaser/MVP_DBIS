import type { UnifiedCheckin } from './checkin'
import type { DemoPatient } from './demo'
import { plural, templateSummary } from './reportSummary'

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

const MEDICATION_REPORT_LABELS: Record<string, string> = {
  reported_taken: 'patient reported taken',
  reported_missed: 'patient reported missed',
  reported_not_yet_taken: 'patient reported not yet taken',
  uncertain: 'patient unsure',
}
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

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
  const observed = periodCheckins.filter(checkin => checkin.extractionStatus !== 'failed')
  const symptomLabels = new Map<string, string>()
  observed.forEach((checkin) => checkin.observations
    .filter((item) => item.category === 'symptom' && item.value.status === 'present')
    .forEach((item) => symptomLabels.set(item.code, String(item.value.label ?? item.code))))

  const medicationReports = observed.flatMap((checkin) => checkin.observations
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
      recorded: periodCheckins.length,
      unconfirmed: periodCheckins.length - confirmed.length,
      symptomDays: [...symptomLabels].map(([code, label]) => ({ code, label, days: new Set(observed.filter(checkin => checkin.observations.some(item => item.category === 'symptom' && item.code === code && item.value.status === 'present')).map(checkin => dateOf(checkin.timestamp))).size })),
      reviewItems: observed
        .filter((checkin) => checkin.requiresHumanReview)
        .map((checkin) => ({
          date: dateOf(checkin.timestamp),
          evidence: checkin.observations.filter((item) => item.category === 'context' && item.evidence).map((item) => item.evidence as string),
        })),
      medicationReports,
    },
    // Patient statements and dispensing are separate sources; neither verifies ingestion.
    medicationMismatches: [] as { date: string; patientReport: string; dispenserStatus: string }[],
  }
}

export function computeFlags(metrics: GpReportMetrics, config: GpReportConfig = GP_REPORT_CONFIG): ReportFlag[] {
  const flags: ReportFlag[] = []
  const bp = metrics.bloodPressure

  if (bp.readings > 0 && bp.aboveTargetCount / bp.readings >= config.aboveTargetShare) {
    flags.push({
      code: 'bp.above_target',
      message: `${bp.aboveTargetCount} of ${bp.readings} readings at or above the configured demo target of ${config.systolicTarget}/${config.diastolicTarget} mmHg`,
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
      message: `Dispenser recorded ${plural(metrics.dispenser.missed, 'missed dose')}: ${metrics.dispenser.missedDates.join(', ')}`,
    })
  }
  if (metrics.medicationMismatches.length) {
    flags.push({
      code: 'medication.report_dispenser_mismatch',
      message: `Patient report and dispenser disagree on ${metrics.medicationMismatches.map((item) => `${item.date}: ${MEDICATION_REPORT_LABELS[item.patientReport] ?? item.patientReport}, dispenser recorded ${item.dispenserStatus}`).join('; ')}`,
    })
  }
  metrics.checkins.symptomDays
    .filter((symptom) => symptom.days >= config.recurringSymptomDays)
    .forEach((symptom) => flags.push({ code: 'symptom.recurring', message: `${capitalize(symptom.label)} reported on ${plural(symptom.days, 'day')}` }))
  if (metrics.checkins.reviewItems.length) {
    flags.push({
      code: 'checkin.requires_review',
      message: `${plural(metrics.checkins.reviewItems.length, 'check-in')} marked for clarification (not a triage result)`,
    })
  }
  return flags
}

export function detectMissedClusters(events: DispenserEvent[]) {
  const sorted = [...events].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const clusters: DispenserEvent[][] = []
  let run: DispenserEvent[] = []
  const flush = () => { if (run.length >= 3) clusters.push(run); run = [] }
  for (const event of sorted) {
    if (event.status !== 'missed') { flush(); continue }
    if (run.length && dateOf(event.scheduledAt) !== addDays(dateOf(run[run.length - 1].scheduledAt), 1)) flush()
    run.push(event)
  }
  flush()
  return clusters
}

export function buildReportFromData(patient: DemoPatient, period: ReportPeriod, checkins: UnifiedCheckin[]) {
  const data: PatientReportData = { ...patient, period, checkins }
  const metrics = computeMetrics(data)
  const flags = computeFlags(metrics)
  const daily = listDates(data.period).map(date => {
    const reading = patient.bloodPressure.find(item => dateOf(item.timestamp) === date)
    const dispense = patient.dispenser.find(item => dateOf(item.scheduledAt) === date)
    return { date, systolic: reading?.systolic ?? null, diastolic: reading?.diastolic ?? null, dispenser: dispense?.status ?? null }
  })
  const missedClusters = detectMissedClusters(patient.dispenser).map(events => {
    const from = dateOf(events[0].scheduledAt)
    const to = dateOf(events[events.length - 1].scheduledAt)
    const beforeReadings = patient.bloodPressure.filter(item => dateOf(item.timestamp) >= addDays(from, -7) && dateOf(item.timestamp) < from)
    const duringReadings = patient.bloodPressure.filter(item => dateOf(item.timestamp) >= from && dateOf(item.timestamp) <= to)
    const before = average(beforeReadings.map(item => item.systolic))
    const during = average(duringReadings.map(item => item.systolic))
    return { from, to, count: events.length, events, beforeReadings, duringReadings, beforeAverageSystolic: before, duringAverageSystolic: during, higherBpDuringCluster: before !== null && during !== null && during - before >= GP_REPORT_CONFIG.risingTrendMmHg }
  })
  return {
    schemaVersion: 'gp-report.v1', syntheticPatientId: patient.patientId, patientName: patient.name,
    generatedAt: new Date().toISOString(), config: GP_REPORT_CONFIG, metrics, flags, daily,
    dispensingAdherence: metrics.dispenser.scheduled ? Math.round(metrics.dispenser.dispensed / metrics.dispenser.scheduled * 1000) / 10 : null,
    missedClusters, bloodPressure: patient.bloodPressure, dispenser: patient.dispenser, wearable: patient.wearable,
    checkins, recentCheckins: checkins.filter(item => dateOf(item.timestamp) > data.period.to),
    summary: { text: templateSummary(metrics, flags), source: 'template' as const },
  }
}


export type GpReport = ReturnType<typeof buildReportFromData>
