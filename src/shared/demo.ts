import type { UnifiedCheckin } from './checkin'
export type WearableDay = { date: string; restingHeartRate: number; sleepMinutes: number; steps: number; activityMinutes: number }
export type DemoData = {
  description: string
  period: { from: string; to: string }
  patients: { patientId: string; name: string; bloodPressure: { timestamp: string; systolic: number; diastolic: number }[]; dispenser: { id: string; scheduledAt: string; medication: string; status: 'dispensed' | 'missed' }[]; wearable: WearableDay[]; checkins: UnifiedCheckin[] }[]
}
export type DemoPatient = DemoData['patients'][number]
