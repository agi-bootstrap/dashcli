# TODOS

## Completed

### `dashcli init` — Zero-config project scaffolding
Creates dashboards/ folder, .dashcli.yaml config, and a sample dashboard from bundled CSV.
Critical for Show HN launch — first-run experience determines adoption.
**Completed:** v0.1.0.0 (2026-03-22) — shipped as `dashcli create [name]`

### Create DESIGN.md via /design-consultation
Formal design system: typography scale, color tokens (all 4 themes), spacing system, component patterns.
**Completed:** v0.1.0.0 (2026-03-22) — extracted from /design-review audit

### Missing favicon
Server returns 404 for `/favicon.ico` on every page load, cluttering console.
**Completed:** v0.1.1.0 (2026-03-22) — returns 204 for /favicon.ico

### Empty charts show no "No data" message
When filters yield no results, ECharts bar/line charts showed blank white area.
**Completed:** v0.1.1.0 (2026-03-22) — empty data guard shows "No data" message

### `dashcli suggest` — AI-powered dashboard recommendations
After connecting a data source, analyze schema and suggest 3-5 relevant dashboards.
Reduces time-to-first-dashboard to near-zero. Major differentiator.
**Completed:** v0.1.2.0 (2026-03-23) — full implementation with LLM trust boundary hardening

### Expand chart & filter vocabulary
Add area, stacked_bar, heatmap, funnel chart types and multi_select, range, text filter types.
Highest-impact step for dashboard expressiveness — all additive, existing specs unaffected.
**Completed:** v0.1.3.0 (2026-03-25) — 4 chart types, 3 filter types, 57 new tests
