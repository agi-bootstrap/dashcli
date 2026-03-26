# TODOS

## Deferred (from /autoplan review 2026-03-26)

### `dashcli data.csv` — One-command-to-dashboard
Auto-suggest + auto-serve in one command. `dashcli data.csv` opens a browser with a heuristic-generated dashboard. The suggest-then-serve pipeline becomes an internal implementation detail. Requires stdin support for serve.
**Source:** CEO subagent finding #1 — "the value is a visible dashboard, not a YAML spec"

### Template-based suggest
Ship 5-10 hand-crafted YAML templates for common data shapes (time-series, event log, transactions). Use profiler to select best-fit template and fill in column names. Higher quality than generic layout algorithm.
**Source:** CEO subagent finding #4b

### Stdin support for `dashcli serve -`
Enable piping suggest output directly to serve. Required for `dashcli suggest data.csv | dashcli serve -` composability.
**Source:** Plan Open Question #1

### Competitive landscape analysis
Add Evidence, Marimo, Observable Framework to competitive analysis. Identify what dashcli does that they cannot (agent-first design, MCP integration).
**Source:** CEO subagent finding #5b

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
