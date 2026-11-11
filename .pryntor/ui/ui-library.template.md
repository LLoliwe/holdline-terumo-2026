# UI library (P75)

One component library per product. Agents compose these components; they never re-implement buttons, inputs, selects, dialogs or menus. New primitives need an ADR.

Library: <name@exact-version>
Path: <folder that holds the library's components, e.g. src/components/ui>
Theme tokens: <path to tokens file>
Security review: <link to ADR or review, date>

<!-- Fallback default for React (P75): if nothing better exists, use Astryx:
  e.g. Library: @astryxdesign/core@0.7.14 (with @stylexjs/stylex@0.19.1)
  e.g. Path: src/ui
  e.g. Theme tokens: src/ui/pryntor-theme.js (copy of principles/ui/pryntor-theme.astryx.js) (interim Pryntor theme; never the default theme)
  e.g. Security review: LLoliwe/pryntor-agent-skills docs/adr/0006 (2026/11/11, USE WITH CHANGES)
Install with --ignore-scripts. Never run `astryx init` into the repo; the reviewed agent text is in
LLoliwe/pryntor-agent-skills principles/ui/astryx-agent-text.md. A better-fit library needs an ADR. -->
