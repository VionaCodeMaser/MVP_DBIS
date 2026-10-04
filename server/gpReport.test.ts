import { describe, expect, it } from 'vitest'
import type { fetch } from 'undici'
import type { CheckinObservation, UnifiedCheckin } from '../src/shared/checkin'
import { buildGpReport, computeFlags, computeMetrics, detectMissedClusters } from './gpReport'
import type { DispenserEvent, PatientReportData } from './gpReport'
import { summarize } from './gpReportSummary'

const period = { from: '2026-09-01', to: '2026-09-10' }
const day = (value: number) => `2026-09-${String(value).padStart(2, '0')}`

function reading(date: number, systolic: number, diastolic = 80) {
  return { timestamp: `${day(date)}T08:00:00.000Z`, systolic, diastolic }
}

function dispense(date: number, status: DispenserEvent['status']): DispenserEvent {
  return { scheduledAt: `${day(date)}T20:00:00.000Z`, medication: 'Amlodipine 5 mg', status }
}

function symptom(code: string, label: string): CheckinObservation {
  return { id: `obs-${code}`, category: 'symptom', code, value: { label, status: 'present' }, evidence: null }
}

function medication(state: string): CheckinObservation {
  return { id: `obs-${state}`, category: 'medication_adherence', code: 'medication.adherence.patient_report', value: { state, source: 'patient_reported', verifiedIngestion: false }, evidence: null }
}

function checkin(date: number, observations: CheckinObservation[], options: { confirmed?: boolean; review?: boolean } = {}): UnifiedCheckin {
  return {
    schemaVersion: 'unified-checkin.v1',
    id: `checkin-${date}-${observations.length}-${options.confirmed === false ? 'u' : 'c'}`,
    syntheticPatientId: 'synthetic-test-patient',
    timestamp: `${day(date)}T21:00:00.000Z`,
    inputSource: 'pasted_text',
    transcript: 'Synthetic test check-in.',
    confirmationStatus: options.confirmed === false ? 'unconfirmed' : 'confirmed',
    requiresHumanReview: options.review ?? false,
    observations,
  }
}

function data(overrides: Partial<PatientReportData>): PatientReportData {
  return { patientId: 'synthetic-test-patient', period, bloodPressure: [], dispenser: [], checkins: [], ...overrides }
}

const flagCodes = (input: PatientReportData) => computeFlags(computeMetrics(input)).map((flag) => flag.code)
const failingFetcher = (async () => { throw new TypeError('Synthetic Ollama service unavailable') }) as unknown as typeof fetch

describe('GP report flag rules', () => {
  it('flags readings above the configured target at exactly 30% and not below', () => {
    const values = (above: number[]) => Array.from({ length: 10 }, (_, index) => reading(index + 1, above.includes(index + 1) ? 140 : 120))
    expect(flagCodes(data({ bloodPressure: values([1, 2, 6]) }))).toContain('bp.above_target')
    expect(flagCodes(data({ bloodPressure: values([1, 6]) }))).not.toContain('bp.above_target')
  })

  it('flags a rising systolic trend at the configured delta and not below', () => {
    const halves = (second: number) => Array.from({ length: 10 }, (_, index) => reading(index + 1, index < 5 ? 130 : second))
    expect(flagCodes(data({ bloodPressure: halves(135) }))).toContain('bp.rising_trend')
    expect(flagCodes(data({ bloodPressure: halves(134) }))).not.toContain('bp.rising_trend')
  })

  it('flags missed dispenser events only when they exist', () => {
    expect(flagCodes(data({ dispenser: [dispense(1, 'dispensed'), dispense(2, 'missed')] }))).toContain('medication.dispenser_missed')
    expect(flagCodes(data({ dispenser: [dispense(1, 'dispensed'), dispense(2, 'dispensed')] }))).not.toContain('medication.dispenser_missed')
  })

  it('keeps patient medication statements separate from dispensing evidence', () => {
    const report = [checkin(3, [medication('reported_missed')])]
    const metrics = computeMetrics(data({ dispenser: [dispense(3, 'dispensed')], checkins: report }))
    expect(metrics.medicationMismatches).toEqual([])
    expect(metrics.checkins.medicationReports[0].state).toBe('reported_missed')
  })

  it('shows unconfirmed AI observations while preserving their status', () => {
    const dizzy = () => [symptom('symptom.dizziness', 'dizziness')]
    expect(flagCodes(data({ checkins: [checkin(1, dizzy()), checkin(4, dizzy()), checkin(7, dizzy())] }))).toContain('symptom.recurring')

    const withUnconfirmed = data({ checkins: [checkin(1, dizzy()), checkin(4, dizzy()), checkin(7, dizzy(), { confirmed: false })] })
    expect(flagCodes(withUnconfirmed)).toContain('symptom.recurring')
    expect(computeMetrics(withUnconfirmed).checkins.unconfirmed).toBe(1)
    expect(computeMetrics(withUnconfirmed).checkins.unconfirmed).toBe(1)
  })

  it('flags check-ins marked for human review', () => {
    expect(flagCodes(data({ checkins: [checkin(2, [], { review: true })] }))).toContain('checkin.requires_review')
    expect(flagCodes(data({ checkins: [checkin(2, [])] }))).not.toContain('checkin.requires_review')
  })
})

describe('GP report summary', () => {
  const metrics = computeMetrics(data({ bloodPressure: [reading(1, 130)], dispenser: [dispense(1, 'missed')] }))
  const flags = computeFlags(metrics)

  it('falls back to the template summary when Ollama is unavailable', async () => {
    const summary = await summarize(metrics, flags, failingFetcher)
    expect(summary.source).toBe('template')
    expect(summary.text).toContain('1 blood pressure reading over 10 days')
    expect(summary.text).toContain('1 missed')
  })

  it('falls back to the template summary when Ollama returns no content', async () => {
    const emptyFetcher = (async () => ({ ok: true, status: 200, json: async () => ({ message: { content: '  ' } }) })) as unknown as typeof fetch
    expect((await summarize(metrics, flags, emptyFetcher)).source).toBe('template')
  })

  it('uses the LLM text when Ollama answers', async () => {
    const fetcher = (async () => ({ ok: true, status: 200, json: async () => ({ message: { content: 'Synthetic summary.' } }) })) as unknown as typeof fetch
    expect(await summarize(metrics, flags, fetcher)).toEqual({ text: 'Synthetic summary.', source: 'llm' })
  })
})

describe('shared 30-day synthetic report', () => {
  it('does not call separated misses a consecutive cluster', () => {
    expect(detectMissedClusters([dispense(1, 'missed'), dispense(2, 'missed'), dispense(4, 'missed')])).toEqual([])
    expect(detectMissedClusters([dispense(1, 'missed'), dispense(2, 'dispensed'), dispense(3, 'missed')])).toEqual([])
  })
  it('calculates dispensing from actual events and detects the three-day cluster', async () => {
    const report = await buildGpReport('synthetic-demo-patient')
    expect(report?.daily).toHaveLength(30)
    expect(report?.bloodPressure).toHaveLength(30)
    expect(report?.wearable).toHaveLength(30)
    expect(report?.dispensingAdherence).toBe(83.3)
    expect(report?.missedClusters).toHaveLength(1)
    expect(report?.missedClusters[0]).toMatchObject({from:'2026-09-18',to:'2026-09-20',count:3,higherBpDuringCluster:true})
    expect(report?.missedClusters[0].events.every(e=>e.status==='missed')).toBe(true)
  })
  it('returns null for an unknown patient', async () => {
    expect(await buildGpReport('unknown-patient')).toBeNull()
  })
})
