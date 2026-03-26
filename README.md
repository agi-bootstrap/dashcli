# dashcli

A lightweight CLI for creating interactive data dashboards from CSV and JSON files. Powered by Bun, SQLite, and ECharts.

```
dashcli suggest data.csv        # AI generates dashboard specs from your data
dashcli serve spec.yaml         # live-reloading dashboard at localhost:3838
dashcli export spec.yaml        # standalone HTML you can email or host anywhere
```

## Install

Requires [Bun](https://bun.sh).

```bash
bun install
```

## Quick start

```bash
# scaffold a sample dashboard
dashcli create my-dashboard

# serve it
dashcli serve dashboards/my-dashboard.yaml
# open http://localhost:3838/d/my-dashboard
```

## Commands

### `dashcli create [name]`

Scaffolds a new dashboard with sample data (`sales.csv`) and a ready-to-edit YAML spec.

### `dashcli serve <spec.yaml>`

Launches a local server on port 3838 with:

- Interactive filters (date range, dropdown)
- Live reload via SSE — edit the YAML or data file and the browser updates automatically
- Responsive layout (CSS Grid, mobile breakpoint at 768px)

### `dashcli export <spec.yaml> [--out dir]`

Exports a self-contained HTML file with ECharts and all data embedded. Works offline, no server needed.

### `dashcli suggest <source> [--out dir]`

Analyzes your CSV/JSON data and generates 3-5 dashboard specs using Claude (requires `ANTHROPIC_API_KEY`). Each spec is validated against the schema before writing.

## Dashboard spec

Dashboards are defined in YAML:

```yaml
name: revenue
title: Revenue Dashboard
source: ./sales.csv
refresh: manual

filters:
  - id: period
    type: date_range
    column: date
    default: ["2025-01-01", "2025-12-31"]
  - id: region
    type: dropdown
    column: region
    default: all

layout:
  columns: 3
  rows: auto

charts:
  - id: total-revenue
    type: kpi
    query: "SELECT SUM(revenue) as value FROM sales WHERE {{period}}"
    label: Total Revenue
    format: currency
    position: [0, 0, 1, 1]

  - id: by-region
    type: custom
    query: "SELECT region, SUM(revenue) as total FROM sales WHERE {{period}} AND {{region}} GROUP BY region"
    label: Revenue by Region
    position: [1, 0, 2, 1]
    option:
      dataset: { source: "$rows" }
      xAxis: { type: category }
      yAxis: {}
      series:
        - type: bar
          encode: { x: region, y: total }
```

### Chart types

| Type | Required fields | Notes |
|------|----------------|-------|
| `custom` | `option` (raw ECharts option object) | Full ECharts 5.6 API — bar, line, pie, scatter, gauge, heatmap, funnel, etc. |
| `kpi` | `query` (returns single value) | Supports `format`: currency, number, percent |
| `table` | `query` (returns rows) | |

`custom` charts use ECharts' `dataset`/`encode` pattern with data binding tokens:

| Token | Resolves to | Example use |
|-------|------------|-------------|
| `"$rows"` | Full query result array | `dataset: { source: "$rows" }` |
| `"$rows.column"` | Array of values for one column | `xAxis: { data: "$rows.region" }` |
| `"$row0.column"` | Scalar from first row | `data: [{ value: "$row0.value" }]` |
| `"$distinct.column"` | Unique values for a column | `xAxis: { data: "$distinct.region" }` |

A registered `dashcli` ECharts theme provides default colors, grid, axis styling, and per-series-type defaults (bar border-radius, line smoothing, pie donut, etc.) so most charts need only `dataset`, axis types, and `series` with `encode`.

### Positions

Positions are `[col_start, row_start, col_span, row_span]`, 0-indexed.

### Filter types

| Type | Default | Notes |
|------|---------|-------|
| `date_range` | `["start", "end"]` | `BETWEEN ? AND ?` |
| `dropdown` | `all` | `column = ?` or `1=1` when "all" |
| `multi_select` | `[]` | `IN (?, ?, ...)` via repeated query params |
| `range` | `[min, max]` | `BETWEEN ? AND ?` with numeric values |
| `text` | `""` | `LIKE '%...%'` with escaped wildcards |

Use `{{filter_id}}` in queries. dashcli replaces filter placeholders with parameterized SQL.

## Project structure

```
src/
  index.ts        CLI entry point
  server.ts       HTTP server + SSE live reload
  schema.ts       Zod-based spec validation
  viewer.ts       HTML/CSS/JS rendering
  query.ts        Filter interpolation + query execution
  datasource.ts   Data source abstraction (CSV/JSON -> SQLite)
  csv.ts          CSV parser + type inference
  json.ts         JSON adapter
  export.ts       Standalone HTML export
  suggest.ts      AI-powered spec generation (Claude API)

sample/           Example dashboards and data
test/             Test suite
```

## Development

```bash
bun run dev              # run CLI in dev mode
bun run typecheck        # type-check without emitting
bun test                 # run test suite
```

## Design

Restrained, data-first aesthetic inspired by Bloomberg Terminal. System fonts, single accent color (`#2563eb`), 4px spacing grid. See [DESIGN.md](DESIGN.md) for the full design system.
