# dossier-summarizer — an AgentPod

A pod whose artifacts **are** an agent: [AGENT.md](AGENT.md) (instructions +
`needs:` capability names), `skills/` (domain knowledge), `tools/` (tool
schemas). No secrets, no endpoints, no executable code live here — `needs:`
names capabilities; the *user's* environment grants them at run time
(delegation is a lease, never a copied credential).

Its demo skill summarizes the other example pods (`example/case`,
`example/patient`) — the agent that explains the universe it ships in.

Stages: `scaffold` → `skill-1` → `tools` → `1.0`. Tool schemas are
**illustrative**: the capability dialect is owned by ozwellai-api and this pod
will track it.
