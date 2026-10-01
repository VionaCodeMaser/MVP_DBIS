# Unified check-in format

The unified check-in is the integration contract for future monitoring, medication-adherence, and GP-report modules.

## Retrieval

```text
GET /api/checkins?patientId=synthetic-demo-patient
```

A confirmed check-in is created with:

```text
POST /api/checkins
Content-Type: application/json
```

The request contains `transcript`, the validated V4 `analysis`, `inputSource` (`microphone` or `pasted_text`), and `confirmationStatus: "confirmed"`.

## Output

```json
{
  "schemaVersion": "unified-checkin.v1",
  "id": "check-in-id",
  "syntheticPatientId": "synthetic-demo-patient",
  "timestamp": "2026-09-24T12:00:00.000Z",
  "inputSource": "pasted_text",
  "transcript": "Ik ben duizelig.",
  "confirmationStatus": "confirmed",
  "requiresHumanReview": false,
  "observations": [
    {
      "id": "observation-id",
      "category": "symptom",
      "code": "symptom.dizziness",
      "value": { "label": "dizziness", "status": "present" },
      "evidence": "Ik ben duizelig."
    },
    {
      "id": "observation-id-2",
      "category": "medication_adherence",
      "code": "medication.adherence.patient_report",
      "value": {
        "state": "not_mentioned",
        "source": "patient_reported",
        "missing": true,
        "verifiedIngestion": false
      },
      "evidence": null
    }
  ]
}
```

## Rules

- One recording produces one parent check-in with zero or more observations.
- Observation codes are stable integration identifiers; labels can remain human-readable.
- Evidence is the exact source transcript substring when present.
- `denied` is an explicit symptom observation. `not_mentioned` is missing medication information, not a denial.
- `patient_reported` adherence is distinct from future dispenser events and does not mean ingestion was verified.
- Only `confirmationStatus: "confirmed"` records should feed confirmed daily-log or GP-report views.
- `requiresHumanReview` is a clarification flag, not a diagnosis, triage result, or notification trigger.
- The current prototype store is in memory because no database implementation exists in this repository. Replace `server/checkinStore.ts` with the project database adapter when one is introduced; keep the contract unchanged.
