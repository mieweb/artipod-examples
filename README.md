# artipod-examples

Fictional-but-credible **demo artipods**, published to
`ghcr.io/mieweb/artipod-examples/<name>` — each built as a **sequence of layers
over time**, so the layer history *is* the record. Open one:

```bash
npm i -g artipod
artipod run -it example/case          # short-name alias for ghcr.io/mieweb/artipod-examples/case
artipod run -it example/case:intake   # time travel — every stage is a tag
```

Or just `artipod run -it` and type `examples`.

## The universe

One coherent fictional world so the pods cross-reference each other:
**Acme Fabrication** (a metal-fab plant), employee **Jordan Rivera** (welder,
badge E-4471), occupational clinic **Harborview Occupational Health**, treating
provider **Dr. Sam Okafor, DO**. Everything is synthetic — see
[DISCLAIMER.md](DISCLAIMER.md), which also ships inside every pod.

| pod | story | stage tags |
|---|---|---|
| `case` | employee injury-absence case (administrative custody) | `intake` `visit-1` `visit-2` `closed` |
| `patient` | the same injury, clinical chart (PHI custody) | `2026-01-14` `2026-01-21` `2026-02-04` + rolling `chart` |
| `ee` | the employee: jobs + wages (PII custody) | `hired` `promoted` `absence` `current` |
| `provider` | credentialing of the treating provider | `application` `verified` `privileged` `recred-2026` |
| `seg` | industrial-hygiene similar exposure group (welders) | `defined` `profile-v1` `sampled-2026-02` `profile-v2` |
| `ticket` | an IT trouble ticket | `opened` `triage` `fix` `closed` |
| `agent` | a pod whose artifacts define an agent | `scaffold` `skill-1` `tools` `1.0` |

Three custodians, three pods, **references but never copies**: wages live only
in `ee`, diagnoses only in `patient`, and `case` bridges by ref. Data-bearing
files are [MDY](https://github.com/mieweb/templit/blob/main/doc/mdy-specification.md)
(YAML front matter = canonical data, markdown narrative with field links).

## Layout

- `<pod>/stages/NN-<name>/` — **additive overlays**: each stage dir holds only
  the files added or changed at that story beat. `<pod>/stages.conf` maps each
  stage to its tag and in-story timestamp (file mtimes are pinned to it, so
  `ls -l` inside a pulled pod reads like the story, and rebuilds are digest-stable).
- `make-assets.mjs` — generates the synthetic binaries (x-rays, PDFs, faxes,
  photos) **once**; outputs are committed. Never regenerated at build time:
  image encoders aren't byte-stable across environments.
- `build.sh` — the dogfood build: applies stages cumulatively and drives the
  stock `artipod` CLI (`import` → per-file CAS layers + `org.artipod.parents`
  chaining on the rolling `:latest`; `tag` → stage tags), producing a
  spec-compliant OCI layout in `dist-store/`.
- `publish.sh` — copies every ref from `dist-store/` to ghcr.io
  (digest-preserving; the parents DAG references manifests by digest).

## Rebuild + publish

```bash
./build.sh                 # → dist-store/ (needs: npm i -g artipod)
./publish.sh               # → ghcr.io (needs: crane, a token with write:packages)
```

Re-running `build.sh` on an unchanged checkout is a no-op by construction:
content-addressed layers + pinned mtimes + `--actor examples-builder`.
