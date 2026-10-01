import { randomUUID } from 'node:crypto'
import type { CheckinAnalysisV4, CheckinInputSource, CheckinObservation, UnifiedCheckin } from '../src/shared/checkin'

export const SYNTHETIC_PATIENT_ID = 'synthetic-demo-patient'

function stableSymptomCode(label: string) {
  const normalized = label.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  if (/neck|cervical/.test(normalized)) return 'symptom.neck_pain'
  if (/pijn|pain/.test(normalized)) return 'symptom.generalized_pain'
  if (/diarr|diarree/.test(normalized)) return 'symptom.diarrhea'
  if (/duiz|dizz/.test(normalized)) return 'symptom.dizziness'
  if (/moe|tired|fatigue/.test(normalized)) return 'symptom.fatigue'
  const slug = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'reported'
  return `symptom.${slug}`
}

function observation(category: CheckinObservation['category'], code: string, value: Record<string, unknown>, evidence: string | null): CheckinObservation {
  return { id: randomUUID(), category, code, value, evidence }
}

export function transformAnalysisToCheckin(options: {
  analysis: CheckinAnalysisV4
  transcript: string
  inputSource: CheckinInputSource
  syntheticPatientId?: string
  timestamp?: string
  confirmationStatus?: 'confirmed' | 'unconfirmed'
}): UnifiedCheckin {
  const { analysis, transcript } = options
  const observations: CheckinObservation[] = analysis.symptoms.map((symptom) => observation(
    'symptom',
    stableSymptomCode(symptom.label),
    { label: symptom.label, status: symptom.status },
    symptom.evidence,
  ))

  if (analysis.confusion.detected) {
    observations.push(observation('confusion', 'confusion.explicit', {
      detected: true,
      topic: analysis.confusion.topic,
    }, analysis.confusion.evidence))
  }

  observations.push(observation('emotional_state', 'emotion.reported', {
    state: analysis.emotionalState,
    polarity: analysis.emotionalPolarity,
    missing: analysis.emotionalPolarity === 'not_stated',
  }, analysis.emotionalEvidence))

  if (analysis.medicationAdherence !== 'not_mentioned') {
    observations.push(observation('medication_adherence', 'medication.adherence.patient_report', {
      state: analysis.medicationAdherence,
      source: 'patient_reported',
      verifiedIngestion: false,
    }, analysis.medicationEvidence))
  }

  if (analysis.context.possibleDisorientation.detected) {
    observations.push(observation('context', 'context.possible_disorientation', { uncertain: true }, analysis.context.possibleDisorientation.evidence))
  }
  if (analysis.context.socialIsolation.reported) {
    observations.push(observation('context', 'context.social_isolation', { reported: true }, analysis.context.socialIsolation.evidence))
  }
  if (analysis.context.contactPreference.noContactRequested) {
    observations.push(observation('context', 'context.contact_preference.no_contact', { noContactRequested: true }, analysis.context.contactPreference.evidence))
  }

  return {
    schemaVersion: 'unified-checkin.v1',
    id: randomUUID(),
    syntheticPatientId: options.syntheticPatientId || SYNTHETIC_PATIENT_ID,
    timestamp: options.timestamp || new Date().toISOString(),
    inputSource: options.inputSource,
    transcript,
    confirmationStatus: options.confirmationStatus || 'unconfirmed',
    requiresHumanReview: analysis.requiresHumanReview,
    observations,
  }
}

export function countDistinctSymptomDays(checkins: UnifiedCheckin[], symptomCode: string) {
  return new Set(
    checkins
      .filter((checkin) => checkin.confirmationStatus === 'confirmed')
      .flatMap((checkin) => checkin.observations
        .filter((item) => item.category === 'symptom' && item.code === symptomCode && item.value.status !== 'denied')
        .map(() => checkin.timestamp.slice(0, 10))),
  ).size
}
