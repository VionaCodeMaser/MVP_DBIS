import type { GpReportMetrics, ReportFlag } from './gpReport'
export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function templateSummary(metrics: GpReportMetrics, flags: ReportFlag[]) {
  const bp = metrics.bloodPressure
  const dispenser = metrics.dispenser
  return [
    bp.readings
      ? `${plural(bp.readings, 'blood pressure reading')} over ${metrics.period.days} days, average ${bp.averageSystolic}/${bp.averageDiastolic} mmHg.`
      : 'No blood pressure readings in this period.',
    `Dispenser: ${dispenser.dispensed} of ${dispenser.scheduled} doses dispensed, ${dispenser.missed} missed.`,
    `${plural(metrics.checkins.confirmed, 'confirmed check-in')}.`,
    flags.length ? `${plural(flags.length, 'flag')} raised, listed below.` : 'No flags raised.',
  ].join(' ')
}

