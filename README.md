# PulseNote — connected school MVP

Synthetic data only. One elderly patient uses a smartwatch interface; Whisper transcribes the message, Ollama extracts validated observations, and the same unified record reaches a GP overview. No real devices, diagnosis, authentication or permanent database.

## Run locally

Requires Node.js 20+ and npm. For actual extraction, install Ollama and pull the model:

```sh
npm ci
ollama pull qwen3:4b
ollama serve
npm run dev
```

Open http://127.0.0.1:5173 for the watch and AI Insights, and http://127.0.0.1:5173/report.html for the GP page. If Ollama is already running, omit `ollama serve`. Configure `OLLAMA_URL`, `OLLAMA_MODEL` and `OLLAMA_TIMEOUT_MS` as environment variables if needed.

Whisper downloads Xenova/whisper-base in the browser on first use and caches it. The first transcription can take time and requires network access to its model assets. Microphone access requires localhost or HTTPS and permission. This school demo is intended for fictional statements only.

## Pitch journey

1. Show the watch overview, switch between heart rate, sleep, activity and steps. The snapshot is September 30 and uses the exact same wearable records as the GP page.
2. Open Voice, record a short synthetic statement, and stop. The patient sees “Message captured”; they do not see JSON or approve an AI classification.
3. Watch the actual extraction appear in AI Insights. The backend saves it as `unconfirmed`, preserving transcript, evidence, source, timestamp and observation statuses. Details are expandable outside the patient interface.
4. Open the GP overview or press Refresh. The newly recorded check-in appears with the same backend record ID. Actual captures after September are explicitly outside the historical reporting period; they are not backdated or mixed into September calculations.
5. Show 83.3% dispensing adherence (25/30), the BP chart, and the September 18–20 cluster. Open Why? to see the event IDs and BP comparison records.
6. Acknowledge the medication reminder. It changes only the watch acknowledgement; it never changes dispensing adherence or verifies ingestion.

Developer demo input is tucked below AI Insights. It sends synthetic text through the real Ollama and save endpoints, allowing the same journey without microphone hardware. It does not produce canned successful AI output.

## Shared data and calculations

`server/data/syntheticReportData.json` contains one fictional patient, 30 daily BP readings, 30 dispensing events, 30 wearable snapshots and unified check-ins. The period is September 1–30, 2026. Evening dispensing is 20:00 Europe/Amsterdam (18:00 UTC in September). Five events are missed: days 7, 18, 19, 20 and 26. BP rises starting day 19.

- Adherence = dispensed events / scheduled events × 100, rounded to one decimal.
- Cluster detector = at least three missed events on consecutive days.
- Pattern comparison = mean systolic BP during the cluster versus the preceding seven days. A rise of at least 5 mmHg is a configurable demonstration rule, not a clinical threshold.
- Temporal overlap does not establish causation. Patient reports, wearable context, BP and dispensing are visibly separate sources.
- Fixture check-ins seed the same in-memory store read by `GET /api/checkins` and the GP report. New records are not duplicated or transformed into a dashboard-specific check-in format.

## Failure behavior

If Ollama fails or returns invalid extraction, the captured transcript is saved as an unconfirmed unified record with `extractionStatus: "failed"` and no observations. The panel and GP show this explicitly. If transcription fails, no transcript or observations are invented. If backend saving fails, the panel says “Not saved” and keeps the captured transcript visible.

The in-memory store resets on server restart. Synthetic fixture records are reseeded. New voice recordings are not persisted after restart.

## Validation and production preview

```sh
npm run test:analysis -- --threads false
npm run build
npm run preview
```

The build includes both HTML entry points. Unit/API tests cover extraction rules, transformation, dispensing arithmetic, clusters, identical save/retrieve records, unconfirmed status and capture-only failures. Optional live Ollama cases in the existing analysis test suite require `RUN_LIVE_OLLAMA_TESTS=1`.

Before the pitch, run the full microphone → browser Whisper → local Ollama journey on the machine that will present. Check browser permission, model loading and responsiveness. Also inspect both pages at desktop and phone widths.
