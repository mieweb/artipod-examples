# Employee file — Jordan Rivera (E-4471), Acme Fabrication

The **payroll/HR** record: identity, employment history, wages — the **PII**
pod. It holds no clinical information, ever: the 2026 injury appears here only
as lost-time accounting that *references* the employer's absence case
(`example/case`). Diagnoses live in the clinic's chart (`example/patient`),
which this file cannot see.

Stages: `hired` → `promoted` → `absence` → `current`. Identifiers are
deliberately fictional shapes (900-range SSN, 555 phone) — see /DISCLAIMER.md.
