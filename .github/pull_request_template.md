<!-- PRYNTOR-PRINCIPLES-BLOCK v1.6.0 -->
## What and why

<!-- One paragraph. Link the Linear issue (PRY-...) and ADR if any. -->

## Proof

<!-- Commands run, exit codes, CI links. Label: draft / preview / verified / released. -->

## Principles gate

- [ ] PRINCIPLES v1.6.0 read
- [ ] gitleaks clean; no secrets in code, logs, prompts or tickets (P28, P44)
- [ ] Lint, types (strict on domain), tests, import contracts pass; output above (P2, P3, P14)
- [ ] External calls: timeout + bounded jittered retry in one layer; mutations idempotent (P16, P20)
- [ ] Loops, batches, agent runs and LLM calls bounded (P10)
- [ ] Invariant checks on state changes; property tests for parsers, money, state machines (P9, P11)
- [ ] No bare or silent except; no untested fallback (P21, P22)
- [ ] Migrations additive or ADR-linked; new PI fields in data register (P18, P19)
- [ ] New deps justified, locked with hashes, pip-audit/osv clean, Actions pinned by SHA (P29, P45)
- [ ] Security workflow green; no unexplained suppressions (P45)
- [ ] Threat-model ADR for new entry point, store, integration or agent tool; object-level auth tested (P40, P42, P43)
- [ ] Prompt/model/tool change has before/after eval results (P32)
- [ ] Tabular prediction uses a tabular model that beats a logged baseline; person-affecting: explanations + fairness check; weights licences in docs/models.md (P29, P78)
- [ ] Release of an app with auth, user data or an LLM: deep security audit linked (docs/security/audits/DATE/, validators pass, confirmed findings fixed or ADR-accepted) (P89)
- [ ] Media added/changed listed in media-manifest.csv; generated media disclosed, C2PA where supported; none in BTWW; HOLDLINE demos are real recordings (P77)
- [ ] External comms (posts, emails, pitches, notices): comms header complete (ring, locale, legal, localisation, BLUF, one ask, claims, channel); readability on target; exact-text approval recorded before any send (P79 to P88)
- [ ] ADR linked for material decisions (P36)
- [ ] No AI co-author trailers; credit line below (P35)

## Design review (UI changes only; delete if none)

- [ ] Concept sentence + three directions recorded (P49)
- [ ] Critic rubric table attached: 9 of 12 lines at 4+, none below 3; squint + greyscale screenshots (P50, P51)
- [ ] Tokens only (OKLCH); type on scale; tabular numerals; SVG icons, no emoji (P52, P53, P67)
- [ ] All eight states: hover, focus-visible, active, disabled, loading, empty, error, success (P55)
- [ ] axe zero violations; Lighthouse a11y 100; keyboard + VoiceOver pass; 44px targets (P57)
- [ ] Lighthouse budgets: LCP <= 2.5s, CLS <= 0.1, TBT <= 200ms; reduced-motion clean (P54, P58)
- [ ] Response-time states (100ms / 1s / 10s); errors prevented first (P62, P64)
- [ ] Visual regression at 1512x982, 1728x1117, 440x956 reviewed (P61)
- [ ] Content real and sourced; no dark patterns; brand guardrails (P59, P61)
- [ ] UI composes the declared library; new/imported components meet the definition of done, pinned, reviewed, re-themed (P75, P76)
- [ ] Public/pitch page: verified outcome first, state labelled, source linked; buzzword check clean; 5-second test recorded (P74)

Built by Lebohang Loliwe using AI agents under his direction.
