import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { UnifiedCheckin } from '../src/shared/checkin'
import { getCheckins, saveCheckin } from './checkinStore'

export type WearableDay = { date: string; restingHeartRate: number; sleepMinutes: number; steps: number; activityMinutes: number }
export const demoData = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./data/syntheticReportData.json', import.meta.url)), 'utf8')) as {
  description: string
  period: { from: string; to: string }
  patients: { patientId: string; name: string; bloodPressure: { timestamp: string; systolic: number; diastolic: number }[]; dispenser: { id: string; scheduledAt: string; medication: string; status: 'dispensed' | 'missed' }[]; wearable: WearableDay[]; checkins: UnifiedCheckin[] }[]
}
export function seedDemoCheckins() {
  for (const patient of demoData.patients) {
    const ids = new Set(getCheckins(patient.patientId).map(item => item.id))
    for (const checkin of patient.checkins) if (!ids.has(checkin.id)) saveCheckin(checkin)
  }
}
