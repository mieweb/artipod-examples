# Rollback plan — CHG-2026-0233

If 2.14.1 misbehaves within the monitoring window:

1. Drain queue (`print-svc admin drain --wait`), max 5 min.
2. Redeploy pinned 2.13.6 artifact (kept warm on fab-app-1; config unchanged —
   2.13.6 ignores the new cache keys).
3. Restart clients' spooler connections (they reconnect automatically; worst
   case one duplicate print per in-flight job — same failure mode as the bug).
4. Reopen this ticket at severity S2 and escalate to the vendor.

Rollback NOT triggered — see close-out in [../resolution.mdy](../resolution.mdy).
