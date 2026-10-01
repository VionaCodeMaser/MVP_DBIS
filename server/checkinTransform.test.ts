import { describe, expect, it } from 'vitest'
import type { CheckinAnalysisV4 } from '../src/shared/checkin'
import { countDistinctSymptomDays, transformAnalysisToCheckin } from './checkinTransform'

function analysis(overrides: Partial<CheckinAnalysisV4> = {}): CheckinAnalysisV4 {
  return {
    analysisSchemaVersion: 'checkin-analysis.v4',
    symptoms: [],
    confusion: { detected: false, topic: null, evidence: null },
    emotionalState: 'not_stated',
    emotionalPolarity: 'not_stated',
    emotionalEvidence: null,
    medicationAdherence: 'not_mentioned',
    medicationEvidence: null,
    context: {
      possibleDisorientation: { detected: false, evidence: null },
      socialIsolation: { reported: false, evidence: null },
      contactPreference: { noContactRequested: false, evidence: null },
    },
    requiresHumanReview: false,
    ...overrides,
  }
}

it('creates one parent check-in with multiple linked observations', () => {
  const checkin = transformAnalysisToCheckin({
    analysis: analysis({
      symptoms: [{ label: 'generalized pain', evidence: 'Alles doet pijn.', status: 'present' }],
      confusion: { detected: true, topic: 'instructions', evidence: 'Waar ben ik?' },
      context: {
        possibleDisorientation: { detected: true, evidence: 'Waar ben ik?' },
        socialIsolation: { reported: true, evidence: 'Ik heb niemand meer' },
        contactPreference: { noContactRequested: true, evidence: 'niemand bellen' },
      },
      requiresHumanReview: true,
    }),
    transcript: 'Alles doet pijn. Waar ben ik? Ik heb niemand meer, niemand bellen.',
    inputSource: 'pasted_text',
    confirmationStatus: 'confirmed',
  })

  expect(checkin.observations.length).toBeGreaterThan(4)
  expect(new Set(checkin.observations.map((item) => item.id)).size).toBe(checkin.observations.length)
  expect(checkin.observations.every((item) => item.id && item.evidence === null || item.evidence && checkin.transcript.includes(item.evidence))).toBe(true)
  expect(checkin.confirmationStatus).toBe('confirmed')
})

it('counts distinct confirmed days for a stable symptom code', () => {
  const first = transformAnalysisToCheckin({
    analysis: analysis({ symptoms: [{ label: 'dizziness', evidence: 'Ik ben duizelig.', status: 'present' }] }),
    transcript: 'Ik ben duizelig.',
    inputSource: 'microphone',
    timestamp: '2026-09-20T09:00:00.000Z',
    confirmationStatus: 'confirmed',
  })
  const sameDay = transformAnalysisToCheckin({
    analysis: analysis({ symptoms: [{ label: 'dizziness', evidence: 'Nog steeds duizelig.', status: 'present' }] }),
    transcript: 'Nog steeds duizelig.',
    inputSource: 'microphone',
    timestamp: '2026-09-20T18:00:00.000Z',
    confirmationStatus: 'confirmed',
  })
  const unconfirmed = transformAnalysisToCheckin({
    analysis: analysis({ symptoms: [{ label: 'dizziness', evidence: 'Ik ben duizelig.', status: 'present' }] }),
    transcript: 'Ik ben duizelig.',
    inputSource: 'pasted_text',
    timestamp: '2026-09-21T09:00:00.000Z',
    confirmationStatus: 'unconfirmed',
  })

  expect(countDistinctSymptomDays([first, sameDay, unconfirmed], 'symptom.dizziness')).toBe(1)
})

it('does not create a medication observation when no medication information was reported', () => {
  const checkin = transformAnalysisToCheckin({
    analysis: analysis({
      symptoms: [{ label: 'dizziness', evidence: 'Ik ben niet duizelig.', status: 'denied' }],
      medicationAdherence: 'not_mentioned',
    }),
    transcript: 'Ik ben niet duizelig.',
    inputSource: 'pasted_text',
    confirmationStatus: 'unconfirmed',
  })
  const symptom = checkin.observations.find((item) => item.category === 'symptom')!
  expect(symptom.value.status).toBe('denied')
  expect(checkin.observations.some((item) => item.category === 'medication_adherence')).toBe(false)
})

it('stores an explicit medication report with exact evidence and a specific neck-pain code', () => {
  const checkin = transformAnalysisToCheckin({
    analysis: analysis({
      symptoms: [{ label: 'neck_hurt', evidence: 'My neck hurts', status: 'present' }],
      medicationAdherence: 'reported_not_yet_taken',
      medicationEvidence: "I haven't taken my meds",
    }),
    transcript: "My neck hurts, I haven't taken my meds.",
    inputSource: 'pasted_text',
  })
  const symptom = checkin.observations.find((item) => item.category === 'symptom')!
  const medication = checkin.observations.find((item) => item.category === 'medication_adherence')!
  expect(symptom.code).toBe('symptom.neck_pain')
  expect(medication.code).toBe('medication.adherence.patient_report')
  expect(medication.value.state).toBe('reported_not_yet_taken')
  expect(medication.evidence).toBe("I haven't taken my meds")
})

it('stores corrected confirmed values rather than an original draft', () => {
  const checkin = transformAnalysisToCheckin({
    analysis: analysis({ symptoms: [{ label: 'dizziness', evidence: 'Ik ben duizelig.', status: 'present' }] }),
    transcript: 'Ik ben duizelig.',
    inputSource: 'pasted_text',
    confirmationStatus: 'confirmed',
  })
  const symptom = checkin.observations.find((item) => item.category === 'symptom')!
  expect(symptom.code).toBe('symptom.dizziness')
  expect(symptom.value.status).toBe('present')
})

describe('unified check-in output', () => {
  it('uses the synthetic demo patient by default', () => {
    const checkin = transformAnalysisToCheckin({ analysis: analysis(), transcript: 'Prima.', inputSource: 'pasted_text' })
    expect(checkin.syntheticPatientId).toBe('synthetic-demo-patient')
  })
})
