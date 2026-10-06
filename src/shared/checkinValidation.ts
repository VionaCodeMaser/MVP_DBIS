import { z } from 'zod'
import { MEDICATION_ADHERENCE_STATUSES } from './checkin'

const MedicationAdherenceSchema = z.enum(MEDICATION_ADHERENCE_STATUSES)
const SymptomStatusSchema = z.enum(['present', 'resolved', 'denied'])
const EmotionalPolaritySchema = z.enum(['positive', 'negative', 'mixed', 'uncertain', 'not_stated'])

export const CheckinAnalysisSchema = z.object({
  analysisSchemaVersion: z.literal('checkin-analysis.v4'),
  symptoms: z.array(z.object({
    label: z.string().min(1),
    evidence: z.string().min(1),
    status: SymptomStatusSchema,
  }).strict()),
  confusion: z.object({
    detected: z.boolean(),
    topic: z.string().nullable(),
    evidence: z.string().nullable(),
  }).strict(),
  emotionalState: z.string().min(1),
  emotionalPolarity: EmotionalPolaritySchema,
  emotionalEvidence: z.string().nullable(),
  medicationAdherence: MedicationAdherenceSchema,
  medicationEvidence: z.string().nullable(),
  context: z.object({
    possibleDisorientation: z.object({ detected: z.boolean(), evidence: z.string().nullable() }).strict(),
    socialIsolation: z.object({ reported: z.boolean(), evidence: z.string().nullable() }).strict(),
    contactPreference: z.object({ noContactRequested: z.boolean(), evidence: z.string().nullable() }).strict(),
  }).strict(),
  requiresHumanReview: z.boolean(),
}).strict().superRefine((value, context) => {
  if (!value.confusion.detected && (value.confusion.topic !== null || value.confusion.evidence !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['confusion'], message: 'Undetected confusion must have null topic and evidence' })
  }
  if (value.emotionalPolarity === 'not_stated' && (value.emotionalState !== 'not_stated' || value.emotionalEvidence !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['emotionalState'], message: 'Not-stated emotion must have not_stated state and null evidence' })
  }
  if ((value.medicationAdherence === 'not_mentioned') !== (value.medicationEvidence === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['medicationEvidence'], message: 'Medication status and supporting evidence must agree' })
  }
  if (value.context.possibleDisorientation.detected && value.context.possibleDisorientation.evidence === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['context', 'possibleDisorientation'], message: 'Detected disorientation requires evidence' })
  }
  if (!value.context.possibleDisorientation.detected && value.context.possibleDisorientation.evidence !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['context', 'possibleDisorientation'], message: 'Undetected disorientation requires null evidence' })
  }
  if (value.context.socialIsolation.reported && value.context.socialIsolation.evidence === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['context', 'socialIsolation'], message: 'Reported social isolation requires evidence' })
  }
  if (!value.context.socialIsolation.reported && value.context.socialIsolation.evidence !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['context', 'socialIsolation'], message: 'Unreported social isolation requires null evidence' })
  }
  if (value.context.contactPreference.noContactRequested && value.context.contactPreference.evidence === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['context', 'contactPreference'], message: 'Contact preference requires evidence' })
  }
  if (!value.context.contactPreference.noContactRequested && value.context.contactPreference.evidence !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['context', 'contactPreference'], message: 'Unreported contact preference requires null evidence' })
  }
  if (!value.requiresHumanReview && (value.context.possibleDisorientation.detected || value.context.socialIsolation.reported || value.context.contactPreference.noContactRequested)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['requiresHumanReview'], message: 'Context requiring clarification must set requiresHumanReview true' })
  }
})

