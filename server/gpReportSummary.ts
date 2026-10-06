import { fetch } from 'undici'
import { OLLAMA_MODEL, OLLAMA_TIMEOUT_MS, OLLAMA_URL } from './analyzeCheckin'
import type { GpReportMetrics, ReportFlag } from './gpReport'

export type ReportSummary = { text: string; source: 'llm' | 'template' }

const SUMMARY_PROMPT = `Write 3-5 plain English sentences for a GP, summarizing only the figures and flags in the JSON you receive.
The data is synthetic. Do not diagnose, assess urgency, or give treatment or medication advice. Do not add numbers that are not in the JSON.`

import { templateSummary } from '../src/shared/reportSummary'
export { plural, templateSummary } from '../src/shared/reportSummary'

export async function summarize(metrics: GpReportMetrics, flags: ReportFlag[], fetcher: typeof fetch = fetch): Promise<ReportSummary> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)
  try {
    const response = await fetcher(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        think: false,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: JSON.stringify({ metrics, flags }) },
        ],
      }),
    })
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`)
    const payload = await response.json() as { message?: { content?: string } }
    const text = payload.message?.content?.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    if (!text) throw new Error('Ollama returned no summary')
    return { text, source: 'llm' }
  } catch (error) {
    console.warn('[gp-report] Using template summary:', error instanceof Error ? error.message : error)
    return { text: templateSummary(metrics, flags), source: 'template' }
  } finally {
    clearTimeout(timeout)
  }
}

