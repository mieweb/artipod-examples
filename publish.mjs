#!/usr/bin/env node
/**
 * publish.mjs — copy every ref in dist-store/ (OCI image layout) to ghcr.io
 * over the distribution API, digest-preserving (the org.artipod.parents DAG
 * references manifests by digest; a normalizing copy would orphan it).
 *
 *   GHCR_USER=<github-user> GHCR_TOKEN=$(gh auth token) ./publish.mjs [ref-filter]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STORE = process.env.STORE ?? new URL('./dist-store', import.meta.url).pathname;
const USER = process.env.GHCR_USER;
const TOKEN = process.env.GHCR_TOKEN;
const FILTER = process.argv[2];
if (!USER || !TOKEN) {
  console.error('usage: GHCR_USER=<user> GHCR_TOKEN=$(gh auth token) ./publish.mjs [ref-filter]');
  process.exit(2);
}

const index = JSON.parse(readFileSync(join(STORE, 'index.json'), 'utf8'));
const blob = (digest) => readFileSync(join(STORE, 'blobs/sha256', digest.slice(7)));

const tokens = new Map(); // repo → bearer
async function bearer(repo) {
  if (tokens.has(repo)) return tokens.get(repo);
  const url = `https://ghcr.io/token?service=ghcr.io&scope=repository:${repo}:pull,push`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${USER}:${TOKEN}`).toString('base64')}` } });
  if (!res.ok) throw new Error(`token exchange failed for ${repo}: ${res.status} ${await res.text()}`);
  const t = (await res.json()).token;
  tokens.set(repo, t);
  return t;
}

async function api(repo, path, init = {}) {
  const res = await fetch(`https://ghcr.io/v2/${repo}/${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await bearer(repo)}` },
    redirect: 'follow',
  });
  return res;
}

async function ensureBlob(repo, digest, bytes) {
  if ((await api(repo, `blobs/${digest}`, { method: 'HEAD' })).ok) return false;
  const start = await api(repo, 'blobs/uploads/', { method: 'POST' });
  if (start.status !== 202) throw new Error(`upload start ${digest}: ${start.status} ${await start.text()}`);
  const loc = new URL(start.headers.get('location'), 'https://ghcr.io');
  loc.searchParams.set('digest', digest);
  const put = await fetch(loc, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${await bearer(repo)}`, 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  if (!put.ok) throw new Error(`blob PUT ${digest}: ${put.status} ${await put.text()}`);
  return true;
}

let pushed = 0;
for (const m of index.manifests) {
  const ref = m.annotations?.['org.opencontainers.image.ref.name'];
  if (!ref || !ref.startsWith('ghcr.io/')) continue;
  if (FILTER && !ref.includes(FILTER)) continue;
  const [, repoAndTag] = ref.match(/^ghcr\.io\/(.+)$/);
  const i = repoAndTag.lastIndexOf(':');
  const repo = repoAndTag.slice(0, i);
  const tag = repoAndTag.slice(i + 1);

  const manifestBytes = blob(m.digest);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  let moved = 0;
  // The reachable set includes annotation-referenced layer-index artifacts —
  // index-level pulls and pull-then-push resync both walk them.
  const descriptors = [manifest.config, ...manifest.layers];
  const extras = manifest.layers
    .map((l) => l.annotations?.['org.artipod.layer-index'])
    .filter((d) => /^sha256:[0-9a-f]{64}$/.test(d ?? ''))
    .map((digest) => ({ digest }));
  for (const desc of [...descriptors, ...extras]) {
    if (await ensureBlob(repo, desc.digest, blob(desc.digest))) moved++;
  }
  const put = await api(repo, `manifests/${tag}`, {
    method: 'PUT',
    headers: { 'Content-Type': manifest.mediaType ?? 'application/vnd.oci.image.manifest.v1+json' },
    body: manifestBytes,
  });
  if (!put.ok) throw new Error(`manifest PUT ${ref}: ${put.status} ${await put.text()}`);
  const returned = put.headers.get('docker-content-digest');
  if (returned && returned !== m.digest) throw new Error(`digest moved for ${ref}: local ${m.digest} → remote ${returned}`);
  console.log(`pushed ${ref}  ${m.digest}  (+${moved} blobs)`);
  pushed++;
}
console.log(`${pushed} refs pushed to ghcr.io`);
