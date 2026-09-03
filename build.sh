#!/usr/bin/env bash
# Dogfood build: apply each pod's stage overlays cumulatively and drive the
# stock artipod CLI. `import` to the rolling :latest chains org.artipod.parents
# (the DAG is the timeline); `tag` pins each stage. Output: dist-store/, a
# spec-compliant OCI image layout.
set -euo pipefail
cd "$(dirname "$0")"

STORE="${STORE:-$PWD/dist-store}"
NS="ghcr.io/mieweb/artipod-examples"
PODS=(case patient ee provider seg ticket agent)

command -v artipod >/dev/null || { echo "artipod not found — npm i -g artipod" >&2; exit 1; }

# Always build from scratch: the parents DAG is stage N → stage N−1, and
# re-importing stage 1 into a store whose head is the final stage would chain
# it to the WRONG parent. From-scratch builds are deterministic instead
# (pinned mtimes + --actor): two builds of the same checkout agree digest-for-digest.
if [ -e "$STORE" ]; then
  [ -f "$STORE/oci-layout" ] || { echo "refusing to remove $STORE — not an OCI layout" >&2; exit 1; }
  rm -rf "$STORE"
fi

for pod in "${PODS[@]}"; do
  work="$(mktemp -d)"
  echo "== $pod"
  first_date="$(awk '!/^#/ && NF {print $3; exit}' "$pod/stages.conf")"
  cp DISCLAIMER.md "$work/"          # ships inside every pod
  touch -d "$first_date" "$work/DISCLAIMER.md"
  while read -r dir tag date; do
    [ -z "${dir:-}" ] && continue
    case "$dir" in \#*) continue ;; esac
    cp -R "$pod/stages/$dir/." "$work/"
    # Pin this stage's files to the in-story timestamp: narratively-correct
    # `ls -l` inside the pod AND digest-stable rebuilds (mtime rides the layer).
    (cd "$pod/stages/$dir" && find . -type f) | while read -r f; do
      touch -d "$date" "$work/${f#./}"
    done
    artipod import "$work" "$NS/$pod:latest" --store "$STORE" --actor examples-builder | tail -1
    artipod tag "$NS/$pod:latest" "$NS/$pod:$tag" --store "$STORE"
  done < "$pod/stages.conf"
  rm -rf "$work"
done

# the chart's rolling tag (docs/dossier.md: the entity's current state)
artipod tag "$NS/patient:latest" "$NS/patient:chart" --store "$STORE"

echo
echo "== digest table (pin these in docs)"
node -e '
  const idx = JSON.parse(require("fs").readFileSync(process.argv[1] + "/index.json", "utf8"));
  for (const m of idx.manifests) {
    const ref = m.annotations?.["org.opencontainers.image.ref.name"];
    if (ref) console.log(ref.padEnd(58), m.digest);
  }' "$STORE" | sort
