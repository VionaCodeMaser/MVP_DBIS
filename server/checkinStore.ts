import type { UnifiedCheckin } from '../src/shared/checkin'

const checkins = new Map<string, UnifiedCheckin>()

export function saveCheckin(checkin: UnifiedCheckin) {
  checkins.set(checkin.id, checkin)
  return checkin
}

export function getCheckins(syntheticPatientId: string) {
  return [...checkins.values()]
    .filter((checkin) => checkin.syntheticPatientId === syntheticPatientId)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
}

export function clearCheckins() {
  checkins.clear()
}
