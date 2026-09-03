# Updates — TKT-20260302-114

- **2026-03-02 08:55** (P. Whitfield) — Opened. Print jobs to FAB-PRN-02 stall
  for several minutes; two work orders printed twice this morning. Started
  after the weekend.
- **2026-03-02 09:30** (D. Chen) — Assigned. FAB-PRN-02 itself healthy;
  print-svc host `fab-app-1` shows RSS climbing since Friday 18:00 — exactly
  the 2.14 patch window. Collecting diagnostics.
- **2026-03-02 11:10** (D. Chen) — Diagnostics attached under
  `diagnostics/` (log excerpt, netstat, env report, screenshot, support
  bundle). Hypothesis: spooler memory leak in 2.14; queue drains only between
  GC pauses; client retry on timeout explains the duplicate prints.
