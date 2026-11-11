# Threat model: <feature> (ADR NNNN)

- **State:** draft | reviewed | accepted (Lebo)
- **Date:** YYYY/MM/DD
- **Feature and assets:** what it does; what an attacker wants (data, money, accounts, agent authority).
- **Data flow:** actors, processes, stores, external services; mark each trust boundary (browser/server, server/vendor, agent/tool, untrusted content/agent).

## STRIDE per element

| Element | Spoofing | Tampering | Repudiation | Info disclosure | DoS | Elevation | Control + test |
| --- | --- | --- | --- | --- | --- | --- | --- |

## LINDDUN (personal information)

Linking, Identifying, Non-repudiation, Detecting, Data disclosure, Unawareness, Non-compliance (POPIA purpose, retention, consent, s19 safeguards, s22 notification, s72 cross-border).

## LLM / agent threats (OWASP LLM Top 10)

Prompt injection (direct and indirect), insecure output handling, excessive agency, sensitive data disclosure, supply chain (skills, MCP servers, plugins). For each: allow-listed tools, approval step, isolation of untrusted content.

## Attack tree (top asset)

Goal at root; OR/AND branches down to concrete steps; mark cheapest path.

## Decisions

Each threat: mitigated (link control and test) | accepted (Lebo signs, with expiry) | transferred (to whom). No TBD.

Built by Lebohang Loliwe using AI agents under his direction.
