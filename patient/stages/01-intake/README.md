# Chart — Jordan Rivera (Harborview Occupational Health)

The **clinical** record: diagnoses, procedures, imaging, orders — under the
clinic's custody. The employer's absence case (`example/case`) receives only
work-status summaries; payroll's employee file (`example/ee`) sees nothing
here at all. That separation is the point of these example pods.

Per-encounter folders live under `visits/<date>/` (the
[dossier pattern](https://github.com/mieweb/artipod/blob/main/docs/dossier.md));
shared summaries (`summary.mdy`, `problems.mdy`, …) are updated across
encounters. Each encounter is a milestone tag (`2026-01-14`, `2026-01-21`,
`2026-02-04`); `chart` is the rolling current state.

Data-bearing files are MDY with FHIR-shaped front matter — a FHIR-aware system
ingests the data layer; everyone else reads the narrative.
