# PulseNote — school MVP

One fictional patient, one shared dataset, and two ways to examine the journey from patient statements to a GP pre-consultation overview. Synthetic data only; no diagnosis or treatment advice.

## Lecturers: choose how to run

| Mode | What works | Requirements |
| --- | --- | --- |
| **Example replay** | Three selectable transcripts, observation cards, saved session records, GP dashboard, dispensing calculations, BP chart and Why? evidence | Browser for the hosted build; Node.js 20+ and npm to run locally. No Ollama or microphone. |
| **Live Ollama** | Real recording → browser Whisper → validated Ollama extraction → backend save → GP overview | Node.js 20+, npm, local Ollama and qwen3:4b. Internet for Whisper's first model download; microphone optional. |

### Option A — example replay, no Ollama

The replay feature is implemented. A hosted URL will be available after the repository owner enables GitHub Pages and deploys the included workflow. **A deployed link has not yet been verified.**

To run locally, install [Node.js](https://nodejs.org/), then clone the repository or download and extract its ZIP. Open a terminal in the project folder and run one command:

```sh
npm run demo:replay
```

This installs dependencies and starts the static replay app. Stop an older dev server for this project before running it. For developers with dependencies already installed, use `npm run dev:replay` instead.

Open:
- Watch and AI Insights: http://127.0.0.1:5173/
- GP overview: http://127.0.0.1:5173/report.html

**Examiner walkthrough:**

1. Select one of the three examples beneath AI Insights:
   - **Symptoms & medication:** “My neck hurts. I haven't taken my meds yet.”
   - **Medication uncertainty:** “I'm not sure whether I took my tablet.”
   - **Context for clarification:** “Where am I? I have nobody anymore.”
2. Inspect the observation cards. Open View details for the exact transcript, evidence and unified record. Interpretations remain unconfirmed.
3. Click Open GP overview. The same session record, with the same ID, appears separately from objective BP and dispensing data.
4. Inspect 83.3% dispensing adherence (25/30), the 30-day BP chart and the September 18–20 cluster. Open Why? to inspect the underlying event IDs and BP comparison records.
5. Return to the watch and try another example. Selecting the same example again replaces its session entry rather than inflating the count. Reset replay session clears only this tab's replay records.

**Transparency:** the bundled starter examples are **curated, hand-authored synthetic observations**, validated against the existing analysis schema and exact evidence substrings. They are not claimed to be Ollama outputs. The UI explicitly labels them **“Curated example — no live AI extraction.”** The team can replace them with genuine Ollama captures using the command below. Captured examples are labeled **“Precomputed Ollama example — no live AI extraction”** and retain model, digest, capture time and pipeline metadata.

Replay uses no microphone, Whisper, live inference or backend API. Records stay in this browser tab's session storage; different visitors do not share them. Use the GP navigation in the same tab. Refresh retains the session; closing the tab ends it. The fixture dataset and report calculations are shared with live mode, rather than copied static chart results.

### Option B — live Ollama extraction

Install Node.js 20+ and [Ollama](https://ollama.com/download), then in the repository folder:

```sh
npm ci
ollama pull qwen3:4b
npm run dev
```

Ollama must be running. Its installed desktop app normally provides the service. If it is not running, execute `ollama serve` in a **separate terminal** and leave it running. Do not start a second service if port 11434 is already occupied.

Open http://127.0.0.1:5173/?mode=live or click Live Ollama in the local interface. Open the GP using its navigation link, which preserves live mode.

1. Select Voice, allow the microphone, record a short **synthetic** statement and stop.
2. The patient sees Message captured. Whisper transcribes in the browser, and Ollama extracts observations. AI Insights displays actual results.
3. The backend stores an unconfirmed unified record. Open the GP to inspect that same record.
4. Without a microphone, expand Developer demo input and submit a synthetic transcript. This bypasses Whisper but still uses actual Ollama extraction.

Whisper downloads Xenova/whisper-base on first use and caches it. Allow time and internet access for the first transcription. Microphone access requires localhost or HTTPS and permission. Configure `OLLAMA_URL`, `OLLAMA_MODEL` and `OLLAMA_TIMEOUT_MS` as environment variables if needed.

If Ollama extraction fails, the transcript is saved with `extractionStatus: "failed"` and no invented observations. Transcription failures do not invent text. Backend save failures are explicitly marked Not saved. Live records are in memory and reset when the server restarts; fixture records are reseeded.

### Team: capture genuine Ollama replay outputs

With Ollama and qwen3:4b running, execute:

```sh
npm run capture:replays
```

This passes all three exact synthetic transcripts through the existing `analyzeCheckin` pipeline (Ollama, explicit transcript rules, V4 schema and evidence validation). It records the actual resulting analyses, model name/digest and capture timestamps. It does not require microphone recording or claim Whisper was used.

The command writes `src/data/replayExamples.json` **only after all three captures validate and the expected medication/review behavior is present**. If Ollama, validation or the expected behavior fails, the existing file remains unchanged. Review the resulting evidence and fixture diff, commit the file, then rebuild/redeploy. Do not manually label curated data as a model capture.

### Team: publish the examiner link with GitHub Pages

1. Merge the replay implementation into main when ready.
2. On GitHub, open Settings → Pages → Build and deployment and choose **GitHub Actions** as the source. GitHub Pages availability depends on repository visibility and your GitHub plan.
3. Open Actions → **Deploy example replay** → Run workflow on main. Subsequent pushes to main also deploy.
4. Wait for both build and deploy jobs to succeed. Copy the URL shown by the github-pages deployment/Settings → Pages and verify it in a separate browser session before sending it to examiners.
5. Check all three examples, GP navigation, reset, mobile layout and Why? evidence. Confirm that hosted mode displays replay labels and does not offer live microphone/inference controls.

The workflow builds with `npm run build:replay`, uses GitHub's configured base path, and publishes only static assets. No hosted Ollama, server or database is required. The hosted build always uses replay mode, even if a visitor changes the query string to `mode=live`.

For another static host, deploy the contents of `dist` after `npm run build:replay`. Set `DEMO_BASE_PATH` during build when hosting below a subdirectory. Merely deploying the live backend is not part of this replay setup.

## Shared data and calculations

`server/data/syntheticReportData.json` contains one fictional patient, 30 BP readings, 30 dispensing events, 30 wearable snapshots and fixture check-ins for September 1–30, 2026. Evening dispensing is 20:00 Europe/Amsterdam. Five events are missed: days 7, 18, 19, 20 and 26. BP rises beginning day 19.

- Adherence = dispensed / scheduled × 100, rounded to one decimal.
- Cluster = at least three missed events on consecutive days.
- BP comparison = average systolic during the cluster versus the preceding seven days. A 5 mmHg rise is a demonstration rule, not a clinical threshold.
- The report describes temporal overlap, not a causal relationship.
- Watch acknowledgements and patient medication statements never alter dispensing adherence or verify ingestion.
- Both modes use the same check-in transformer, record contract, dataset and report calculations. Live mode retrieves backend records; replay retrieves the current tab's session records.
- New session/live records preserve actual timestamps; captures outside September appear separately from period calculations.

## Validation and builds

```sh
npm run test:analysis -- --threads false
npm run build:replay
npm run preview:replay
```

For the live production build:

```sh
npm run build
npm run preview
```

Both builds include the watch and GP HTML pages. The live preview launcher is cross-platform, including Windows PowerShell. Optional live Ollama tests require `RUN_LIVE_OLLAMA_TESTS=1`; they are not a prerequisite for replay assessment.

## Troubleshooting

- **Windows EPERM / esbuild.exe:** stop this project's older dev server with Ctrl+C before reinstalling dependencies.
- **Old interface:** inspect Git status and local edits. Preserve local work before switching branches. Restart the correct server and hard-refresh.
- **Port 5173 occupied:** stop the old project server. The static launcher fails explicitly rather than silently switching to another port.
- **Replay record missing on GP:** use the GP link in the same browser tab and allow session storage. Separate browser sessions intentionally do not share records.
- **Curated labels after capture:** commit the changed fixture, rebuild and redeploy; an earlier deployed build still contains the older examples.
- **Live mode fails on a static host:** the hosted examiner build is replay-only. Run the repository locally for actual Whisper/Ollama functionality.
