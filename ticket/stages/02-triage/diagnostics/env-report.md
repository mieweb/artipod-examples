# Environment report — fab-app-1 (print-svc host), 2026-03-02 10:58

- print-svc **2.14.0** (deployed 2026-02-27 18:02 — Friday patch window;
  previous: 2.13.6, stable since 2025-11)
- Host: 8 GB RAM, RSS at capture **7.9 GB** and climbing ~220 MB/h since the
  deploy; no other services co-located.
- Queue baseline depth 10–14; observed 41 with GC pauses 8–9.5 s
  ([app.log](app.log)).
- Clients retry on 90 s timeout → duplicate accepts → duplicate prints.
- 2.14.0 changelog includes "job metadata cache" — prime leak suspect; cache
  has no eviction setting in the shipped config.
- Full capture: [support-bundle.tar.gz](support-bundle.tar.gz) (log, heap
  snapshot); UI state at capture: [screenshot.png](screenshot.png).
