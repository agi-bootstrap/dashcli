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

### P0+P1: Agent-first CLI output + read/diff commands
`--json` flag on all commands, `dashcli read`, `dashcli diff`, JSON Schema publication,
structured error codes, chart ID uniqueness, CSV type inference fix, file size check.
**Completed:** v0.2.0 (2026-03-24)

## Backlog

### P1: `dashcli validate` command
Validate a YAML spec without serving or exporting. Returns structured validation errors.
Useful for CI/CD pipelines and agent workflows that need fast spec validation.

### P1: Accept JSON input specs alongside YAML
Allow specs to be written in JSON as well as YAML. The Zod schema already validates
the parsed object — just need a JSON parser path in the spec loader.

### P1: SSE endpoint keyed on mutable spec name
The SSE endpoint uses the spec `name` field in the URL path. If the name changes in
the YAML, the live reload connection breaks. Should key on file path instead.

### P1: Dual `deriveTableName` implementations
`csv.ts` and `datasource.ts` both have `deriveTableName()` with slightly different
logic. Consolidate to one implementation.

### P2: Spec version field for forward compatibility
Add an optional `version` field to the spec schema (e.g., `version: 1`). This allows
future breaking changes to the spec format without silently misinterpreting old specs.

### P2: Example MCP wrapper in docs
A reference implementation showing how to wrap dashcli in an MCP server. Target persona:
an engineer who has built at least one MCP server before. Not built into dashcli itself.

### P2: SSE connection limit unbounded
No limit on simultaneous SSE connections. A runaway browser tab loop could exhaust
file descriptors. Add a reasonable cap (e.g., 10 connections).

### P2: Export regex surgery fragility
`export.ts` uses regex replacements to transform the viewer HTML for offline use.
If the viewer template changes, the regexes silently fail. Consider a template-based
approach or at least add assertions that replacements matched.

### P2: CSV parser limitations
The CSV parser doesn't handle embedded newlines within quoted fields or BOM (byte order
mark) at the start of UTF-8 files. Both are common in real-world CSV exports.

### P3: Position overlap validation
No validation that chart positions don't overlap in the grid layout. Two charts can
claim the same grid cell without error.
