# TODOS

## P2 — Phase 2

### `dashcli suggest` — AI-powered dashboard recommendations
After connecting a data source, analyze schema and suggest 3-5 relevant dashboards.
Reduces time-to-first-dashboard to near-zero. Major differentiator.
Effort: M (human: ~1 week / CC: ~1-2 hours)
Depends on: Smart Schema Summary (Phase 1)
Source: /plan-ceo-review 2026-03-22

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
