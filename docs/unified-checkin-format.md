# Unified check-in contract

The watch, AI Insights and GP overview use `UnifiedCheckin` from `src/shared/checkin.ts`. `server/checkinTransform.ts` is the only analysis-to-observation transformation.

A record has `schemaVersion`, `id`, `syntheticPatientId`, `timestamp`, `inputSource`, original `transcript`, `confirmationStatus`, `requiresHumanReview` and `observations`. Each observation retains its category, stable code, structured value and original transcript evidence.

`confirmationStatus` is `unconfirmed` for the automatic watch journey: the patient did not review or confirm AI interpretation. Existing explicitly confirmed records remain compatible. “Message captured” only acknowledges the recording.

`extractionStatus` is optionally `complete` or `failed` (legacy records can omit it). On failed extraction, the transcript is retained with no observations and unconfirmed status. It is not an invented empty successful analysis.

## Endpoints

- `GET /api/demo`: shared 30-day synthetic patient dataset.
- `POST /api/checkins/analyze`: validates the transcript and returns Ollama V4 analysis.
- `POST /api/checkins`: accepts transcript, V4 analysis, source, optional timestamp and patient ID, and confirmed/unconfirmed status. Successful analysis goes through the existing transformer. For capture-only failure, omit analysis and supply `extractionStatus: "failed"`.
- `GET /api/checkins?patientId=synthetic-demo-patient`: unified records from the in-memory store.
- `GET /api/reports/gp?patientId=synthetic-demo-patient`: calculated objective report plus the same unified records. Captures outside September are displayed separately with real timestamps.

Symptom present/resolved/denied states and medication reported_taken/reported_missed/reported_not_yet_taken/uncertain states are preserved. Dispensing releases do not verify ingestion; patient statements are not matched to a dose solely by calendar date.
