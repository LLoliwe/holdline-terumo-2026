# Astryx agent text (reviewed, vendored)

**State:** verified 2026/11/11 against `@astryxdesign/cli@0.7.14` (generated in a scratch directory with `CI=1 NO_UPDATE_NOTIFIER=1` and a throwaway `HOME`; not run in any Pryntor repo). Review: ADR 0006.
**Use:** paste the "Pryntor rules" and the vendored block into a repo's `docs/agents/ui-library.md` when that repo declares Astryx (P75). Do not run `astryx init` to produce it.

## Pryntor rules for Astryx (these win over the vendored block)

1. Astryx is the fallback default for React UI only when nothing better is declared (P75). An in-house library, a brand system or a better-fit vetted library wins with an ADR. Not for BTWW, HOLDLINE, the Tirisano site or non-React repos.
2. Pin exact versions: `@astryxdesign/core@0.7.14`, `@stylexjs/stylex@0.19.1` (plus `@astryxdesign/cli@0.7.14` as a dev dependency only if the repo needs `theme build`). No `^` or `~`. Install with `--ignore-scripts` (`.npmrc`: `ignore-scripts=true`, `save-exact=true`); the postinstall only prints a nudge, but we do not run install scripts by default.
3. Never run `astryx init` in a repo, and never `astryx init --user` (it writes a skill into `~/.agents/skills` and `~/.claude/skills`). If a CLI refresh is ever needed, run it in a scratch directory, diff, and vendor the reviewed text here through a PR.
4. Run the CLI with `CI=1 NO_UPDATE_NOTIFIER=1` so it does not start its daily background update check against the npm registry.
5. `astryx gap-report --confirm-public` files a public GitHub issue with your `gh` login: that is an outbound action and needs Lebo's approval of the exact text. `astryx blog` reads a remote feed; avoid in CI.
6. Theme: use the Pryntor theme (`src/ui/pryntor-theme.js`, interim v0); never ship the default or neutral theme. No Google Fonts link: system font stack or self-hosted files only (R0, no third-party requests, POPIA-friendly).
7. Links on dark surfaces: `color="primary"`; product accents may fail 4.5:1 as text (seen with the Exchange red, 3.68:1).
8. The block's "no raw `<div>`" rule is Astryx's guidance; Pryntor's hard rule is P75 (no raw interactive primitives outside the library folder). Follow both where possible.
9. Templates that use StyleX need the StyleX compiler plugin; a repo without it composes components only (as the Exchange pilot does).
10. Credit and decision records as usual (P35, P36). Astryx is MIT; keep its licence notice with any swizzled source.

## Vendored block (verbatim from `astryx init --agent claude`, v0.7.14)

```text
Astryx v0.7.14 · 174 components
CLI: run every command as `bunx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.
Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:
- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then tokens (var(--color-*|--spacing-*|--radius-*)). No raw hex/px. No StyleX/Tailwind compiler here — don't use xstyle/utility classes directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.
- Palettes and custom colors go through the theme, never :root overrides. Run `astryx theme add <slug>` to import; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token.

`astryx help` lists every command. Key ones beyond the workflow:
  search "<query>"   find any component / hook / doc / template
  discover <words>   integrations you could add
  docs <topic>       getting-started, principles, tokens, theme … (`astryx docs` lists all)
  docs cli           commands and API reference
  docs authoring     build an integration package, and every field it holds
  upgrade --from <old version> --apply   run after a dependency bump
<!-- ASTRYX:END -->
```
