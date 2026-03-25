# dashcli

A lightweight CLI for creating interactive data dashboards from CSV and JSON files. Powered by Bun, SQLite, and ECharts.

```
dashcli suggest data.csv        # AI generates dashboard specs from your data
dashcli serve spec.yaml         # live-reloading dashboard at localhost:3838
dashcli export spec.yaml        # standalone HTML you can email or host anywhere
dashcli read spec.yaml          # structured spec summary (text or JSON)
dashcli diff a.yaml b.yaml      # compare two specs, see what changed
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

- Interactive filters (date range, dropdown, multi-select, range, text search)
- Live reload via SSE — edit the YAML or data file and the browser updates automatically
- Responsive layout (CSS Grid, mobile breakpoint at 768px)

### `dashcli export <spec.yaml> [--out dir]`

Exports a self-contained HTML file with ECharts and all data embedded. Works offline, no server needed.

### `dashcli suggest <source> [--out dir]`

Analyzes your CSV/JSON data and generates 3-5 dashboard specs using Claude (requires `ANTHROPIC_API_KEY`). Each spec is validated against the schema before writing.

### `dashcli read <spec.yaml>`

Parses a YAML spec and outputs a structured summary: name, title, source, charts (id, type, position), filters, and layout. Works offline with no API key.

### `dashcli diff <specA> <specB>`

Compares two dashboard specs and outputs a structured changelog keyed by chart/filter ID — added, removed, and changed items with field-level detail.

### Global flags

| Flag | Effect |
|------|--------|
| `--json` | Outputs machine-readable JSON envelope: `{ ok, data, error: { message, code } }` |
| `--format <text\|json>` | Output format (`--json` always wins if both are set) |

**Error codes:** `SPEC_VALIDATION`, `FILE_NOT_FOUND`, `YAML_PARSE_ERROR`, `DATA_SOURCE_ERROR`, `RUNTIME_ERROR`, `UNKNOWN_COMMAND`

**Exit codes:** 0 = success, 1 = validation/file error, 2 = data source error, 3 = runtime error

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
    type: bar
    query: "SELECT region, SUM(revenue) as total FROM sales WHERE {{period}} AND {{region}} GROUP BY region"
    x: region
    y: total
    label: Revenue by Region
    position: [1, 0, 2, 1]
```

### Chart types

| Type | Required fields | Notes |
|------|----------------|-------|
| `kpi` | `query` (returns single value) | Supports `format`: currency, number, percent |
| `bar` | `x`, `y` | |
| `line` | `x`, `y` | Smooth curves |
| `area` | `x`, `y` | Filled line chart |
| `pie` | `x`, `y` | `x` = label, `y` = value |
| `scatter` | `x`, `y` | |
| `gauge` | `query` (returns single value) | Optional `min`, `max` |
| `stacked_bar` | `x`, `y`, `group` | Multi-series stacked bars |
| `heatmap` | `x`, `y`, `value` | Two-axis intensity grid |
| `funnel` | `x`, `y` | Conversion funnel |
| `table` | `query` (returns rows) | |

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
  read.ts         dashcli read — spec summary output
  diff.ts         dashcli diff — spec comparison
  cli-utils.ts    JSON envelope, error codes, output formatting
  gen-schema.ts   JSON Schema generator (Zod -> JSON Schema)

schema/           Published JSON Schema for dashboard specs
sample/           Example dashboards and data
test/             Test suite (239 tests across 20 files)
```

## Development

```bash
bun run dev              # run CLI in dev mode
bun run typecheck        # type-check without emitting
bun test                 # run test suite
bun run gen:schema       # regenerate JSON Schema from Zod spec
```

## Design

Restrained, data-first aesthetic inspired by Bloomberg Terminal. System fonts, single accent color (`#2563eb`), 4px spacing grid. See [DESIGN.md](DESIGN.md) for the full design system.
