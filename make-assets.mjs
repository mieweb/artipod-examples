#!/usr/bin/env node
/**
 * make-assets.mjs — generate the synthetic binaries (x-rays, photos, PDFs,
 * faxes, screenshots, a support bundle) ONCE and write them into the stage
 * trees; outputs are committed. Never run at build time: image encoders are
 * not byte-stable across environments, which is exactly why the bytes live
 * in git. Everything is procedural + seeded — no real images anywhere.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync, deflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';

const root = dirname(new URL(import.meta.url).pathname);
const out = (rel, bytes) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, bytes);
  console.log(`${String(bytes.length).padStart(9)}  ${rel}`);
};

// deterministic PRNG (mulberry32)
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// --- gray "radiograph": dark field, bone-ish capsules, film noise ------------
function xray(w, h, seed, bones) {
  const px = new Float32Array(w * h).fill(0.08);
  const r = rng(seed);
  const capsule = (x0, y0, x1, y1, rad, gain) => {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - rad * 2));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + rad * 2));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - rad * 2));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + rad * 2));
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        const px_ = x - (x0 + t * dx), py_ = y - (y0 + t * dy);
        const d = Math.sqrt(px_ * px_ + py_ * py_);
        if (d < rad * 2) px[y * w + x] += gain * Math.exp(-(d * d) / (rad * rad * 0.55));
      }
    }
  };
  for (const [x0, y0, x1, y1, rad, gain] of bones) capsule(x0 * w, y0 * h, x1 * w, y1 * h, rad * w, gain);
  // soft-tissue halo + heavy film grain (grain is what keeps the JPEG big)
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(1, px[i] + (r() - 0.5) * 0.22));
    const g = Math.round(v * 255);
    data[i * 4] = g; data[i * 4 + 1] = g; data[i * 4 + 2] = g; data[i * 4 + 3] = 255;
  }
  return jpeg.encode({ data, width: w, height: h }, 94).data;
}

const HAND_PA = [ // metacarpals + phalanges, stylized left hand PA
  [0.30, 0.95, 0.34, 0.55, 0.016, 0.9], [0.42, 0.97, 0.44, 0.50, 0.017, 0.9],
  [0.54, 0.97, 0.54, 0.50, 0.017, 0.9], [0.65, 0.95, 0.63, 0.53, 0.016, 0.9],
  [0.76, 0.92, 0.72, 0.58, 0.015, 0.9],
  [0.34, 0.53, 0.35, 0.36, 0.013, 0.85], [0.35, 0.34, 0.36, 0.22, 0.011, 0.8], [0.36, 0.20, 0.365, 0.12, 0.009, 0.75],
  [0.44, 0.48, 0.45, 0.28, 0.014, 0.85], [0.45, 0.26, 0.455, 0.13, 0.012, 0.8], [0.455, 0.11, 0.46, 0.04, 0.009, 0.75],
  [0.54, 0.48, 0.545, 0.26, 0.014, 0.85], [0.545, 0.24, 0.55, 0.10, 0.012, 0.8], [0.55, 0.08, 0.552, 0.01, 0.009, 0.75],
  [0.63, 0.51, 0.64, 0.30, 0.013, 0.85], [0.64, 0.28, 0.645, 0.16, 0.011, 0.8], [0.645, 0.14, 0.65, 0.07, 0.009, 0.75],
  [0.72, 0.56, 0.74, 0.40, 0.012, 0.85], [0.74, 0.38, 0.75, 0.28, 0.010, 0.8],
  [0.18, 0.80, 0.26, 0.62, 0.020, 0.85], [0.26, 0.60, 0.30, 0.48, 0.015, 0.8], // thumb
];
const HAND_LAT = [
  [0.45, 0.97, 0.48, 0.50, 0.030, 0.95], [0.48, 0.48, 0.50, 0.28, 0.022, 0.85],
  [0.50, 0.26, 0.51, 0.12, 0.016, 0.8], [0.51, 0.10, 0.515, 0.03, 0.011, 0.75],
  [0.30, 0.85, 0.40, 0.60, 0.022, 0.85], [0.40, 0.58, 0.44, 0.45, 0.015, 0.8], // thumb column
];

// --- color "photo": gradient field + blobs + grain ---------------------------
function photo(w, h, seed, [r0, g0, b0], [r1, g1, b1], blobs) {
  const r = rng(seed);
  const data = Buffer.alloc(w * h * 4);
  const blobList = Array.from({ length: blobs }, () => [r() * w, r() * h, (0.06 + r() * 0.16) * w, r()]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2;
      let R = r0 + (r1 - r0) * t, G = g0 + (g1 - g0) * t, B = b0 + (b1 - b0) * t;
      for (const [bx, by, br, bs] of blobList) {
        const d2 = (x - bx) ** 2 + (y - by) ** 2;
        const k = Math.exp(-d2 / (br * br)) * 60 * (bs - 0.5);
        R += k; G += k * 0.8; B += k * 0.6;
      }
      const n = (r() - 0.5) * 26;
      const i = (y * w + x) * 4;
      data[i] = Math.max(0, Math.min(255, R + n));
      data[i + 1] = Math.max(0, Math.min(255, G + n));
      data[i + 2] = Math.max(0, Math.min(255, B + n));
      data[i + 3] = 255;
    }
  }
  return jpeg.encode({ data, width: w, height: h }, 90).data;
}

// --- "scanned page" PDF: text header + uncompressed gray noise image ---------
function scanPdf(title, lines, seed, noiseW = 900, noiseH = 1100) {
  const r = rng(seed);
  const img = Buffer.alloc(noiseW * noiseH);
  for (let i = 0; i < img.length; i++) {
    let v = 224 + (r() - 0.5) * 26; // paper
    const y = (i / noiseW) | 0, x = i % noiseW;
    // faint "text" rows: dark speckle bands every ~26px between margins
    if (y > 140 && y % 26 < 10 && x > 70 && x < noiseW - 70 && r() < 0.32) v -= 90 + r() * 80;
    if (y === 100 && x > 60 && x < noiseW - 60) v = 40; // rule under header
    img[i] = Math.max(0, Math.min(255, v));
  }
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = [`BT /F1 18 Tf 50 ${noiseH - 60} Td (${esc(title)}) Tj ET`]
    .concat(lines.map((l, i) => `BT /F1 10 Tf 50 ${noiseH - 90 - i * 14} Td (${esc(l)}) Tj ET`))
    .join('\n');
  const objs = [];
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${noiseW} ${noiseH}] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >>`;
  const content = `q ${noiseW} 0 0 ${noiseH} 0 0 cm /Im1 Do Q\n${text}`;
  objs[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objs[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  const parts = [`%PDF-1.4\n`];
  const offsets = [0];
  for (let i = 1; i <= 6; i++) {
    offsets[i] = parts.join('').length + parts.slice(1).reduce((n) => n, 0); // recomputed below
  }
  // build with byte-accurate offsets
  let pdf = Buffer.from(`%PDF-1.4\n`);
  const xref = [0];
  const append = (buf) => { pdf = Buffer.concat([pdf, buf]); };
  const obj = (n, body) => { xref[n] = pdf.length; append(Buffer.from(`${n} 0 obj\n${body}\nendobj\n`)); };
  obj(1, objs[1]); obj(2, objs[2]); obj(3, objs[3]); obj(4, objs[4]); obj(5, objs[5]);
  xref[6] = pdf.length;
  append(Buffer.from(`6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${noiseW} /Height ${noiseH} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${img.length} >>\nstream\n`));
  append(img);
  append(Buffer.from(`\nendstream\nendobj\n`));
  const xrefAt = pdf.length;
  let table = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) table += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  append(Buffer.from(`${table}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`));
  return pdf;
}

// --- 1-bit uncompressed TIFF "fax page" --------------------------------------
function faxTiff(seed, w = 1728, h = 2200) {
  const r = rng(seed);
  const rowBytes = w / 8;
  const bits = Buffer.alloc(rowBytes * h); // 0 = black in MinIsWhite? use MinIsBlack: 0=black
  const setBlack = (x, y) => { bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7); };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let black = r() < 0.012; // toner speckle
      if (y > 260 && y % 44 < 14 && x > 140 && x < w - 140 && r() < 0.42) black = true; // "text"
      if (y >= 180 && y <= 186 && x > 120 && x < w - 120) black = true; // header rule
      if (black) setBlack(x, y);
    }
  }
  // TIFF header (little-endian) + one IFD, PhotometricInterpretation=WhiteIsZero(0)… use 1 (BlackIsZero) with our 1=black? Keep it simple: 0 = WhiteIsZero means 0 bits are white — our set bits are black. Wrong either way is still a valid, viewable placeholder; choose MinIsWhite(0).
  const entries = [
    [256, 3, 1, w], [257, 3, 1, h], [258, 3, 1, 1], [259, 3, 1, 1], // width,height,bps,no-compression
    [262, 3, 1, 0], // MinIsWhite: set bit = black
    [273, 4, 1, 8 + 2 + 12 * 9 + 4], // strip offset (after header+IFD)
    [277, 3, 1, 1], [278, 3, 1, h], [279, 4, 1, bits.length],
  ];
  const ifd = Buffer.alloc(2 + entries.length * 12 + 4);
  ifd.writeUInt16LE(entries.length, 0);
  entries.forEach(([tag, type, count, value], i) => {
    const o = 2 + i * 12;
    ifd.writeUInt16LE(tag, o); ifd.writeUInt16LE(type, o + 2); ifd.writeUInt32LE(count, o + 4); ifd.writeUInt32LE(value, o + 8);
  });
  const header = Buffer.alloc(8);
  header.write('II', 0); header.writeUInt16LE(42, 2); header.writeUInt32LE(8, 4);
  return Buffer.concat([header, ifd, bits]);
}

// --- PNG "screenshot": window chrome + noise, hand-rolled encoder ------------
function screenshotPng(seed, w = 1440, h = 900) {
  const r = rng(seed);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const put = (x, y, R, G, B) => { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = R; raw[o + 1] = G; raw[o + 2] = B; };
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      let R = 32, G = 34, B = 40; // dark desktop
      if (y < 28) { R = 58; G = 60; B = 66; } // menu bar
      if (x > 80 && x < w - 80 && y > 80 && y < h - 60) { R = 24; G = 26; B = 30; } // terminal window
      if (x > 80 && x < w - 80 && y > 80 && y < 108) { R = 52; G = 54; B = 60; } // title bar
      // "log lines" in the terminal
      if (x > 100 && x < w - 120 && y > 130 && y < h - 80 && y % 18 < 8 && r() < 0.5) { R = 92; G = 200; B = 120; }
      const n = (r() - 0.5) * 10;
      put(x, y, Math.max(0, R + n), Math.max(0, G + n), Math.max(0, B + n));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    let crc = 0xffffffff;
    for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- minimal tar + gzip support bundle ---------------------------------------
function tarGz(files, seed) {
  const blocks = [];
  const header = (name, size) => {
    const b = Buffer.alloc(512);
    b.write(name, 0); b.write('0000644', 100); b.write('0000000', 108); b.write('0000000', 116);
    b.write(size.toString(8).padStart(11, '0'), 124); b.write('00000000000', 136);
    b.write('        ', 148); b.write('0', 156); b.write('ustar', 257); b.write('00', 263);
    let sum = 0; for (const c of b) sum += c;
    b.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    return b;
  };
  for (const [name, content] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    blocks.push(header(name, data.length), data, Buffer.alloc(512 - (data.length % 512 || 512)));
  }
  blocks.push(Buffer.alloc(1024));
  const r = rng(seed);
  void r;
  return gzipSync(Buffer.concat(blocks), { level: 6 });
}

// =============================== generate ====================================
const noise = (n, seed) => { const r = rng(seed); const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (r() * 256) | 0; return b; };

// patient — the hero x-rays + lab report + referral fax
out('patient/stages/01-intake/visits/2026-01-14/imaging/hand-xray-pa.jpg', xray(2200, 2800, 101, HAND_PA));
out('patient/stages/01-intake/visits/2026-01-14/imaging/hand-xray-lat.jpg', xray(2200, 2800, 102, HAND_LAT));
out('patient/stages/01-intake/visits/2026-01-14/lab-report.pdf',
  scanPdf('HARBORVIEW OCCUPATIONAL HEALTH — LABORATORY REPORT', [
    'Patient: Rivera, Jordan   DOB 1993-06-14   Acct: HOH-88231', 'Collected: 2026-01-14 16:20   Reported: 2026-01-14 17:05',
    'CBC w/ diff: within normal limits.', 'Tetanus immunity: adequate (Tdap 2021).',
  ], 201));
out('patient/stages/02-followup/visits/2026-01-21/referral-fax.tiff', faxTiff(301));

// case — scanned first report + provider fax
out('case/stages/01-intake/intake/first-report-scan.pdf',
  scanPdf('ACME FABRICATION — FIRST REPORT OF INJURY (SCAN)', [
    'Employee: Jordan Rivera (E-4471)   Dept: Fabrication — Welding',
    'Date of injury: 2026-01-12 09:10   Location: Bay 3, shear table',
    'Nature: laceration, left hand. See attached witness statement.',
  ], 202));
out('case/stages/02-visit-1/visits/2026-01-14/provider-fax.tiff', faxTiff(302));

// ee — badge photo + offer letter
out('ee/stages/01-hired/documents/badge-photo.jpg', photo(900, 1200, 401, [120, 130, 150], [70, 80, 100], 6));
out('ee/stages/01-hired/documents/offer-letter.pdf',
  scanPdf('ACME FABRICATION — OFFER OF EMPLOYMENT', [
    'Jordan Rivera — Welder I, Fabrication', 'Start date: 2024-03-04   Rate: $24.50/hr   FLSA: non-exempt',
    'Reports to: M. Delgado, Fabrication Supervisor',
  ], 402));

// provider — license scan, diploma photo, recred attestation fax
out('provider/stages/01-application/documents/license-scan.pdf',
  scanPdf('STATE BOARD OF OSTEOPATHIC MEDICINE — LICENSE (SCAN)', [
    'Samuel Okafor, DO   License: DO.51-99841 (fictional)', 'Status at scan: ACTIVE   Expires: 2027-06-30',
  ], 403));
out('provider/stages/01-application/documents/diploma.jpg', photo(1600, 1200, 404, [235, 228, 205], [210, 200, 170], 4));
out('provider/stages/04-recred/documents/attestation-fax.tiff', faxTiff(405));

// seg — pump photos, lab report, calibration cert
out('seg/stages/03-sampled/evidence/2026-02/pump-photos/pump-e4471.jpg', photo(1600, 1200, 501, [90, 95, 100], [40, 45, 55], 8));
out('seg/stages/03-sampled/evidence/2026-02/pump-photos/pump-e4488.jpg', photo(1600, 1200, 502, [95, 90, 100], [45, 40, 55], 8));
out('seg/stages/03-sampled/evidence/2026-02/pump-photos/bay3-overview.jpg', photo(1920, 1280, 503, [70, 80, 95], [30, 35, 45], 12));
out('seg/stages/03-sampled/evidence/2026-02/lab-report.pdf',
  scanPdf('AIH LABORATORIES — INDUSTRIAL HYGIENE ANALYSIS', [
    'Client: Acme Fabrication   Project: SEG-WELD-2026-02', 'Method: NIOSH 7300 (elements), gravimetric fume',
    'See results.mdy in this folder for the transcribed table.',
  ], 504));
out('seg/stages/03-sampled/evidence/2026-02/calibration-cert.pdf',
  scanPdf('FIELD CALIBRATION CERTIFICATE — SKC AIRCHEK', [
    'Pump S/N: AC-20031, AC-20047   Pre: 2.01 L/min   Post: 1.99 L/min', 'Calibrated: 2026-02-09   Technician: R. Osei, CIH',
  ], 505));

// ticket — screenshot + support bundle
out('ticket/stages/02-triage/diagnostics/screenshot.png', screenshotPng(601));
out('ticket/stages/02-triage/diagnostics/support-bundle.tar.gz', tarGz([
  ['bundle/README.txt', 'Support bundle captured 2026-03-02 10:58 — TKT-20260302-114\n'],
  ['bundle/app.log', Array.from({ length: 400 }, (_, i) => `2026-03-02T10:${String(30 + (i % 28)).padStart(2, '0')}:00Z print-svc WARN queue depth ${i % 97}`).join('\n')],
  ['bundle/heap-snapshot.bin', noise(1_200_000, 602)],
], 603));

console.log('done — commit the outputs; never regenerate at build time.');
