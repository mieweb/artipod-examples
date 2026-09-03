---
name: summarize-case
description: Summarize an absence case or clinical chart pod — status, timeline, open questions.
appliesTo: "pods with case.mdy, ticket.mdy, or summary.mdy at the root"
---

# Skill: summarize a dossier pod

1. Read the root status file (`case.mdy` / `ticket.mdy` / `summary.mdy`) —
   its front matter is the current state: status, actors, dates.
2. Read the running log (`timeline.md` / `updates.md`) newest-first for the
   narrative spine.
3. Per-workstream folders (`visits/`, `absence/`, `diagnostics/`…) hold the
   detail; read the `.mdy` front matter of each, skip binaries — their `.mdy`
   sidecars carry the metadata you need.
4. Produce: **one-line status**, **dated timeline** (from the log, verified
   against front-matter dates), **open items** (anything whose front matter
   says open/pending/next), and **references out** (other pods named — do not
   summarize those).
5. Time-travel checks: if asked "when did we know X", diff the relevant file
   across stage tags rather than trusting the narrative's memory.
