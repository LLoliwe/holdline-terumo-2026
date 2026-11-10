# Third-party parts

Everything the app needs is vendored in this repository and served by the Python server. There is no CDN, package manager or auto-update: the offline demo cannot be changed by an upstream release. The server uses only the Python standard library.

| Part | Version | Licence | Files |
|---|---|---|---|
| IBM Plex Sans and IBM Plex Mono | as vendored (woff2, 4 weights each) | SIL Open Font License 1.1, `holdline/static/fonts/OFL.txt` | `holdline/static/fonts/*.woff2` |
| Tabler Icons: alert-triangle, wifi-off, search, arrow-left (outline paths only) | tabler-icons main, file commit ab7315d (2026-10-05); latest release at vendoring v3.51.0 | MIT, `holdline/static/LICENSE-tabler.txt` | inline SVG sprite in `holdline/static/index.html` |

SHA-256 of vendored font files:

```
5788454f0ba4bd6300752c474215c4dd926682fa173ae1c6252d57828b6a235d  IBMPlexMono-Bold.woff2
8c2c290cbd998fa1f647e4572aca6ebbd72589551b0f3f9f8bb8628fbb8219d5  IBMPlexMono-Medium.woff2
49ce58b41a0e1cb921c0f58d9a5b8b96a2cc21437c7066f3ba4f24873076d131  IBMPlexMono-Regular.woff2
ed5eaca7522336959d6c3810bd9bb78424f0d964082d581bfbea169ee08d14e3  IBMPlexMono-SemiBold.woff2
fa7130d854a660b39a7fc9e6e0f2dc23dba5f1346e2adea3e1fe37b6d884133d  IBMPlexSans-Bold.woff2
5660f8a658f8bb50dbc005232f885eadffd2bc1c235c4f6fbb63469d1f9cde6d  IBMPlexSans-Medium.woff2
ba711a3085ff9f27440b6b9c4550cfc47c97bf36591d5da958b975bb3add8c1a  IBMPlexSans-Regular.woff2
f78048030eab62e860efa39a0df79e2e5581bf122eb95b9bc42c0b8a4988d205  IBMPlexSans-SemiBold.woff2
```

Design patterns credited in docs/UI_RETHINK.md (Stripe Dashboard visual style, cmdk, Sonner, Vaul, Linear, an iPhone slide-to-power-off recreation, WWDC 2018 "Designing Fluid Interfaces") are behaviours rebuilt from scratch; no code from them is included.
