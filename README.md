# PulseNote — school MVP

## For lecturers and examiners

PulseNote demonstrates one connected journey: a fictional patient's smartwatch message becomes structured observations, and the GP sees those same records alongside synthetic blood-pressure, dispensing and wearable data.

**Current availability:** the local live Ollama version and the GP dashboard work. The three selectable example replays and hosted examiner link are planned, but are not implemented yet. There is no replay command or deployed URL to use at this stage.

| Route | Requirements | Current availability |
| --- | --- | --- |
| Live extraction | Node.js 20+, npm, Git (or download ZIP), Ollama with qwen3:4b; microphone optional | Available locally |
| GP dashboard only | Node.js 20+ and npm; no Ollama | Available locally with synthetic fixture check-ins |
| Three example replays | No Ollama; the future hosted version will require only a browser | Pending implementation and deployment |

All data and statements used for assessment must be synthetic.

### Option A — run the full MVP with Ollama

1. Install [Node.js](https://nodejs.org/) and [Ollama](https://ollama.com/download).
2. Clone this repository, or download and extract its ZIP. Open a terminal in the project folder:

```sh
git clone https://github.com/VionaCodeMaser/MVP_DBIS.git
cd MVP_DBIS
npm ci
ollama pull qwen3:4b
```

3. Start Ollama if its installed application is not already running. In a separate terminal:

```sh
ollama serve
```

Keep that terminal running. If Ollama reports that its port is already occupied, it may already be running; do not launch a second copy.

4. In the project terminal:

```sh
npm run dev
```

5. Open the URLs printed by the server (normally):
   - Smartwatch and AI Insights: http://127.0.0.1:5173
   - GP overview: http://127.0.0.1:5173/report.html

6. For a microphone-free assessment, expand **Developer demo input** beneath AI Insights and submit: "My neck hurts. I haven't taken my meds yet." This uses actual Ollama extraction, not a replay.
7. Alternatively, select Voice, permit microphone access, record a synthetic statement and stop. Whisper transcribes in the browser; Ollama then extracts observations.
8. Inspect AI Insights and View details, then open or refresh the GP overview. Check that the captured record has the same ID and original evidence. The interpretation is explicitly unconfirmed.
9. On the GP page, inspect 83.3% dispensing adherence, the BP chart and **Why? See the actual records**. New captures outside September appear separately with their real dates.

Whisper downloads its browser model on first use, which requires internet access and can take time. Live voice needs microphone permission on localhost or HTTPS. Typed developer input bypasses microphone and Whisper, but still requires Ollama.

### Option B — inspect the GP dashboard without Ollama now

After cloning or downloading the project, run:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/report.html. The dashboard calculations, BP chart, Why? evidence, wearable values and existing synthetic fixture check-ins do not require Ollama.

**This is not yet interactive example replay.** Submitting new text without Ollama retains the transcript as a failed-extraction record with no observations; it does not simulate successful AI extraction.

### Option C — three example replays (planned examiner route)

When the replay feature is implemented and verified, lecturers will be able to:

1. Open the published examiner link, or start the local version using the standard setup above.
2. Select **Example replay**.
3. Choose one of three synthetic transcript examples.
4. Inspect the saved, validated extraction in AI Insights.
5. Add that example as an unconfirmed unified record to the demo session.
6. Open the GP overview and inspect the same record, alongside calculated objective data.
7. Click Why? to verify the dispensing and BP findings.

The interface must label this route **"Precomputed example — no live AI extraction."** It demonstrates replay of an earlier real Ollama extraction, not a new inference request. A working local live version remains available under Option A.

No hosted link is published yet. This section describes the intended examiner workflow, not an available feature.

## Steps to implement example replay

1. Finalize these synthetic examples:
   - Symptoms and medication: "My neck hurts. I haven't taken my meds yet."
   - Medication uncertainty: "I'm not sure whether I took my tablet."
   - Context for clarification: "Where am I? I have nobody anymore."
2. On a team machine with Ollama running, pass each exact transcript through the existing validated analysis pipeline. Save the actual returned V4 analysis, exact transcript, capture date, model identity and provenance. Review evidence substrings and expected states; do not fabricate successful model outputs.
3. Add a capture script to reproduce/update these fixtures. Fail explicitly if Ollama or validation fails.
4. Add three clearly labeled replay choices. Selecting an example must bypass Whisper and live inference and use only that example's saved validated output.
5. Use the existing check-in transformer and unified record contract. Keep replay interpretation unconfirmed and retain provenance explaining that it is precomputed.
6. Make AI Insights and the GP retrieve the same session record. For an online demo, isolate each examiner's replay session so simultaneous visitors do not mix records.
7. Retain actual session timestamps and explicitly separate captures outside the historical September report. Dispensing adherence must still come only from the shared dispenser dataset.
8. Test replay with Ollama stopped: all three choices, evidence details, matching record IDs, GP appearance, refresh behavior and reset. Verify that no inference request is made. Also verify that live mode still works.
9. Build and deploy the replay demo with the required backend, or implement a deliberate static replay adapter that preserves the same record contract and calculations. Publishing only the current frontend will not work: it depends on API endpoints. Do not bundle a fake successful live analysis or require access to a team member's laptop.
10. Replace the pending labels above with verified run instructions and the actual examiner URL. Add a short video of the live voice → Whisper → Ollama journey as supplementary evidence.

## Troubleshooting

- Windows EPERM for esbuild.exe: stop this project's running dev server with Ctrl+C before retrying npm ci.
- Wrong or older interface: inspect git status and local edits. Preserve local work before switching to main; restart the server in the correct folder and hard-refresh the browser.
- Missing model: run ollama pull qwen3:4b.
- Ollama unavailable: keep its app/service running. The GP dashboard still works, but live extraction cannot succeed.
- Server port occupied: stop the previous server for this project or configure a different PORT; use the URL printed by the server.
- In-memory records reset on server restart. Fixture check-ins are reseeded; new captures are not permanently stored.


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
