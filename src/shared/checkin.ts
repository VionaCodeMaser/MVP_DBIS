export type SymptomFinding = {
  label: string
  evidence: string
}

export type SymptomStatus = 'present' | 'resolved' | 'denied'

export type SymptomFindingV2 = SymptomFinding & {
  status: SymptomStatus
}

export type ConfusionFinding = {
  detected: boolean
  topic: string | null
  evidence: string | null
}

export type MedicationAdherence = 'reported_taken' | 'reported_missed' | 'uncertain' | 'not_mentioned'

export const MEDICATION_ADHERENCE_STATUSES = [
  'reported_taken',
  'reported_missed',
  'reported_not_yet_taken',
  'uncertain',
  'not_mentioned',
] as const

export type MedicationAdherenceV3 = (typeof MEDICATION_ADHERENCE_STATUSES)[number]

export function isMedicationAdherence(value: unknown): value is MedicationAdherenceV3 {
  return typeof value === 'string' && MEDICATION_ADHERENCE_STATUSES.some((status) => status === value)
}

export type CheckinAnalysis = {
  symptoms: SymptomFinding[]
  confusion: ConfusionFinding
  emotionalState: string
  medicationAdherence: MedicationAdherenceV3
}

export type CheckinAnalysisV2 = {
  analysisSchemaVersion: 'checkin-analysis.v2'
  symptoms: SymptomFindingV2[]
  confusion: ConfusionFinding
  emotionalState: string
  emotionalPolarity: 'positive' | 'negative' | 'mixed' | 'uncertain' | 'not_stated'
  emotionalEvidence: string | null
  medicationAdherence: MedicationAdherence
}

export type CheckinAnalysisV3 = Omit<CheckinAnalysisV2, 'analysisSchemaVersion' | 'medicationAdherence'> & {
  analysisSchemaVersion: 'checkin-analysis.v3'
  medicationAdherence: MedicationAdherenceV3
}

export type CheckinAnalysisV4 = Omit<CheckinAnalysisV3, 'analysisSchemaVersion'> & {
  analysisSchemaVersion: 'checkin-analysis.v4'
  medicationEvidence: string | null
  context: {
    possibleDisorientation: { detected: boolean; evidence: string | null }
    socialIsolation: { reported: boolean; evidence: string | null }
    contactPreference: { noContactRequested: boolean; evidence: string | null }
  }
  requiresHumanReview: boolean
}

export type CheckinInputSource = 'microphone' | 'pasted_text'
export type ConfirmationStatus = 'confirmed' | 'unconfirmed'
export type ObservationCategory = 'symptom' | 'confusion' | 'emotional_state' | 'medication_adherence' | 'context'

export type CheckinObservation = {
  id: string
  category: ObservationCategory
  code: string
  value: Record<string, unknown>
  evidence: string | null
}

export type UnifiedCheckin = {
  schemaVersion: 'unified-checkin.v1'
  id: string
  syntheticPatientId: string
  timestamp: string
  inputSource: CheckinInputSource
  transcript: string
  confirmationStatus: ConfirmationStatus
  requiresHumanReview: boolean
  observations: CheckinObservation[]
}
