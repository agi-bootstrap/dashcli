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

### First-class `custom` chart type — delete legacy types
Consolidate 12 chart types to `custom | kpi | table`. Single `renderEChartsOption()` replaces 8 legacy renderers. Adds ECharts theme, data binding tokens, column-not-found warnings, and ResizeObserver lifecycle management.
**Completed:** v0.1.4.0 (2026-03-26) — net-negative complexity, single rendering path

## Deferred (from /design-review 2026-03-26)

### Tablet breakpoint (768-1024px)
Add intermediate 2-column grid layout for tablet viewports. Currently jumps from 3-column to 1-column at 768px. Would improve readability on iPad-class devices. DESIGN.md defines only 2 breakpoints — needs design decision.

### Document warning banner and ECharts secondary colors in DESIGN.md
Warning banner uses amber (#fef3c7/#92400e) not in the palette. ECharts secondary colors (#60a5fa, #93c5fd) used for multi-series charts are undocumented. Both work visually but should be formalized.
