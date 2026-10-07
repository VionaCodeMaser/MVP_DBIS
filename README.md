# Care Bridge — lecturer guide

Care Bridge is a school MVP that connects a simple smartwatch check-in with a GP's pre-consultation overview. It uses **one fictional patient and synthetic data only**.

## Start here: watch the full demonstration

**[▶ Watch the full MVP demonstration on YouTube](https://youtu.be/tfLF7oZ8Ea4)**

The video shows the full functionality of the MVP. To try the working software yourself, follow the instructions below. The video complements the software; it does not replace access to it.

## Choose what you want to try

| Option | What you can try | What you need |
| --- | --- | --- |
| **GP dashboard** — easiest starting point | Medication dispensing, blood-pressure chart, wearable information, existing patient check-ins and the records behind each finding | Node.js |
| **Full MVP** | Everything above, plus a new voice or typed check-in, AI extraction and saving that same check-in to the GP dashboard | Node.js and Ollama |

The application runs **on your own computer**, in your browser. There is currently no hosted application link. You do not need a GitHub account, Git, a smartwatch or coding experience.

## First-time setup

### 1. Install Node.js

Download the **LTS version** from [nodejs.org](https://nodejs.org/) and install it using the default options. Node.js is the program that runs this application. Version 20 or newer is required.

If you already have Node.js 20 or newer, skip this step.

### 2. Download the project

1. Open [the repository](https://github.com/VionaCodeMaser/MVP_DBIS).
2. Click the green **Code** button and choose **Download ZIP**.
3. Extract the ZIP into a normal folder. On Windows, right-click it and select **Extract All**.
4. Open the extracted project folder, usually called **MVP_DBIS-main**. It should contain a file called **package.json**.

Do not run the project from inside the ZIP.

### 3. Open a terminal in that folder

A terminal is a window where you paste the commands below.

- **Windows:** right-click an empty area inside the project folder and choose **Open in Terminal**. If that option is unavailable, type `powershell` in File Explorer's address bar and press Enter.
- **macOS:** right-click the project folder in Finder and select **Services → New Terminal at Folder**, if available.

Paste this command and press Enter:

```sh
npm ci
```

This downloads the application's required components. Wait until it finishes. Internet access is needed for this first setup.

## Start the application — one command after setup

In the same terminal, paste:

```sh
npm run dev
```

**Keep that terminal open while using the MVP.** Open this address in your browser:

**[Open the GP dashboard](http://127.0.0.1:5173/report.html)**

This address works only while the application is running on your computer. If the terminal prints a different address, use that address instead and add `/report.html` for the dashboard.

To stop the application, return to the terminal and press **Ctrl+C**.

Next time, open a terminal in the same project folder and run only `npm run dev`. You do not need to repeat the download or installation.

## Try the GP dashboard — no Ollama needed

1. Look at **83.3% dispensing adherence**. This is calculated from 25 dispensed events out of 30 scheduled events.
2. Inspect the **30-day blood-pressure chart**.
3. Find the pattern of **three missed evening dispensing events on 18–20 September**. BP rises beginning around day 19. These events overlap in time; the system does not claim one caused the other.
4. Click **Why? See the actual records** to inspect the dispensing events and BP readings behind the finding.
5. Explore **Daily context** and **Voice check-ins**. Patient statements remain separate from dispensing and BP measurements.

These records are synthetic. This route demonstrates the working dashboard and its calculations, but does not generate a new AI interpretation.

## Try the full smartwatch → GP journey

### One-time AI setup

1. Install [Ollama](https://ollama.com/download) using the default options. Ollama runs the AI model on your computer.
2. Open Ollama and keep it running.
3. Open a **second terminal** and paste:

```sh
ollama pull qwen3:4b
```

This downloads the AI model and may take several minutes. It requires internet access and several gigabytes of free space. Wait until it finishes. You only need to download the model once.

If Ollama is not running, run `ollama serve` in that second terminal and keep it open. If it says the port is already in use, Ollama may already be running.

### A. Try a typed check-in first

This avoids microphone setup while using the **real Ollama extraction**.

1. Start the application with `npm run dev` if it is not already running.
2. Open **[Smartwatch and AI Insights](http://127.0.0.1:5173)**.
3. Expand **Developer demo input** beneath AI Insights.
4. Paste: **“My neck hurts. I haven't taken my meds yet.”**
5. Click **Process synthetic text** and wait for processing.
6. Inspect the extracted observations in **AI Insights**. Open the details to see the original transcript and evidence.
7. Check the save status, then click **Open GP overview**. Refresh the report if needed.
8. Find the new check-in under **Captured outside the report period**. The historical report covers September 2026; today's check-in retains its actual date.

The interpretation is saved as **unconfirmed**. The patient is not asked to approve the AI's interpretation. New patient statements do not change dispensing adherence.

### B. Try a voice check-in

1. On the smartwatch page, select **Voice**.
2. Allow microphone access when your browser asks.
3. Start recording and speak a short fictional statement, such as the example above.
4. Stop recording.
5. Wait for transcription, AI extraction and saving, then inspect AI Insights and the GP overview as above.

The first voice use downloads the browser's speech-transcription model. This needs internet access and may take time. If recording is unavailable, use the typed check-in instead. Only use fictional statements.

The smartwatch also has a **Daily overview** and a **Medication reminder** with a simple acknowledgement button.

## If something does not work

| Problem | What to do |
| --- | --- |
| `npm` is not recognised | Install Node.js, close the terminal, then open a new terminal in the project folder. |
| Windows blocks `npm.ps1` | Use `npm.cmd ci` and `npm.cmd run dev` instead. |
| Browser says the page cannot be reached | Keep the application terminal open and check that `npm run dev` is running. Use the address printed there. |
| Terminal cannot find `package.json` | Open the extracted project folder that contains that file, then try again. |
| AI extraction is unavailable | Open Ollama and check that `ollama pull qwen3:4b` finished. The GP dashboard remains usable without Ollama. |
| Microphone or transcription fails | Allow microphone permission and use the local address above. Try the typed check-in to bypass speech transcription. |
| Windows reports `EPERM` for `esbuild.exe` | Stop this project's running server with Ctrl+C before retrying `npm ci`. |
| Address is already in use | Stop any earlier running copy of this project, then start it again. |
| A new check-in disappeared | New check-ins are stored temporarily and reset when the server restarts. This is expected for this MVP. |

If AI extraction fails, the application retains the transcript without inventing observations. If saving fails, it shows **Not saved**.

## What this MVP demonstrates

- A simple patient interface with three smartwatch screens.
- Voice → browser Whisper transcription → local Ollama analysis.
- Structured observations with original evidence and an unconfirmed interpretation.
- Backend saving and retrieval of the same check-in for the GP.
- One shared 30-day synthetic dataset: dispensing, BP, heart rate, sleep, steps and activity.
- Calculated adherence, detected missed-event patterns and inspectable evidence.

It does not connect to real devices or real patients. It does not provide diagnosis, emergency escalation or permanent storage. Example replay is not included in the current main version.

## Technical reference — optional

This section is for team members; lecturers do not need it to run the MVP.

- Dataset: `server/data/syntheticReportData.json`, 1–30 September 2026.
- Missed dispensing days: 7, 18, 19, 20 and 26. Scheduled evening dispensing is 20:00 Europe/Amsterdam.
- Adherence: dispensed / scheduled × 100, rounded to one decimal.
- Cluster detection: at least three missed events on consecutive days.
- BP comparison: cluster mean systolic BP versus the preceding seven days. The 5 mmHg demonstration threshold is not a clinical threshold.
- Check-ins use the unified record contract and the same in-memory store for the patient flow and GP report.

Run automated tests and build checks:

```sh
npm run test:analysis -- --threads false
npm run build
```

Live Ollama tests are optional and require `RUN_LIVE_OLLAMA_TESTS=1`. Before presenting, verify the microphone journey on the presentation computer.
