import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { UnifiedCheckin } from '../src/shared/checkin'
import { getCheckins, saveCheckin } from './checkinStore'

import type { DemoData } from '../src/shared/demo'
export const demoData = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./data/syntheticReportData.json', import.meta.url)), 'utf8')) as DemoData
export function seedDemoCheckins() {
  for (const patient of demoData.patients) {
    const ids = new Set(getCheckins(patient.patientId).map(item => item.id))
    for (const checkin of patient.checkins) if (!ids.has(checkin.id)) saveCheckin(checkin)
  }
}
