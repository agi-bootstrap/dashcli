# dashcli

Agent-native BI dashboards from CSV and JSON files. Powered by Bun, SQLite, and ECharts.

```
dashcli suggest data.csv        # generate a dashboard spec from your data
dashcli serve spec.yaml         # live-reloading dashboard at localhost:3838
dashcli render chart.yaml       # render a single chart as PNG (or --as html)
dashcli export spec.yaml        # standalone HTML you can email or host anywhere
dashcli read spec.yaml          # structured spec summary (text or JSON)
dashcli diff a.yaml b.yaml      # compare two specs, see what changed
```

## Install — 30 seconds

**Requirements:** [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Git](https://git-scm.com/), [Bun](https://bun.sh/) v1.0+

### Step 1: Install on your machine

Open Claude Code and paste this. Claude does the rest.

> Install dashcli: run **`git clone https://github.com/agi-bootstrap/dashcli.git ~/.dashcli && cd ~/.dashcli && ./setup`** then add a "dashcli" section to CLAUDE.md that says: dashcli is installed at ~/.dashcli. Use it to create data dashboards and chart images from CSV/JSON files. Commands: `bun ~/.dashcli/src/index.ts suggest <file>` generates a YAML dashboard spec on stdout, `bun ~/.dashcli/src/index.ts suggest <file> --charts-dir ./charts/` also writes individual chart specs, `bun ~/.dashcli/src/index.ts serve <spec>` launches a live-reloading dashboard at localhost:3838, `bun ~/.dashcli/src/index.ts render <chart.yaml>` renders a single chart as PNG (or `--as html`), `bun ~/.dashcli/src/index.ts render <spec> --chart <id>` renders one chart from a dashboard, `bun ~/.dashcli/src/index.ts export <spec>` creates standalone HTML, `bun ~/.dashcli/src/index.ts profile <file>` outputs column classification as JSON. When the user asks to visualize data, create a dashboard, render a chart for a report, or analyze a CSV/JSON file — use dashcli. Add `--ai` to suggest for LLM-powered specs (requires ANTHROPIC_API_KEY).

### Step 2: Add to your repo so teammates get it (optional)

> Add dashcli to this project: run **`cp -Rf ~/.dashcli .dashcli && rm -rf .dashcli/.git && cd .dashcli && ./setup`** then add a "dashcli" section to this project's CLAUDE.md listing the commands and telling Claude to use dashcli when the user asks to visualize data or create dashboards.

Real files get committed to your repo (not a submodule), so `git clone` just works. Everything lives inside `.dashcli/`. Nothing touches your PATH or runs in the background.

### Manual install (without Claude Code)

```bash
git clone https://github.com/agi-bootstrap/dashcli.git ~/.dashcli
cd ~/.dashcli && ./setup
```

Then use `bun ~/.dashcli/src/index.ts` as the command, or add an alias:

```bash
alias dashcli='bun ~/.dashcli/src/index.ts'
```

## Updating

```bash
dashcli upgrade
```

Detects your install type (git clone or vendored), pulls the latest version, runs setup, and shows what changed. Works for both `~/.dashcli` and `.dashcli/` installs.

Check for updates without upgrading:

```bash
dashcli version --check
```

`dashcli serve` also shows a non-blocking hint when an update is available.

## Quick start

```bash
# scaffold a sample dashboard
dashcli create my-dashboard

# serve it
dashcli serve dashboards/my-dashboard.yaml
# open http://localhost:3838/d/my-dashboard
```

Or point at any CSV:

```bash
dashcli suggest data.csv > spec.yaml
dashcli serve spec.yaml
```

## Commands

### `dashcli suggest <source> [--ai]`

Generates a dashboard spec from a CSV or JSON file.

- **Default (heuristic):** Profiles columns, classifies types, generates a deterministic YAML spec. No API key, no network, under 100ms.
- **`--ai` flag:** Uses Claude to generate 3-5 richer specs with semantic understanding. Requires `ANTHROPIC_API_KEY`.

Both modes output YAML to stdout for composability.

Add `--charts-dir <dir>` to also write individual `.chart.yaml` files (one per chart) for use with `dashcli render`.

### `dashcli serve <spec.yaml> [--port n]`

Launches a local server on port 3838 with:

- Interactive filters (date range, dropdown, multi-select, range, text search)
- Live reload via SSE — edit the YAML or data file and the browser updates automatically
- Responsive layout (CSS Grid, mobile breakpoint at 768px)

### `dashcli render <spec> [--chart id] [--as png|html] [--out file]`

Renders a single chart as a PNG image (default) or self-contained HTML file. Works with:

- **Standalone chart spec** (`*.chart.yaml`): `dashcli render chart.yaml`
- **Dashboard spec with chart ID**: `dashcli render dashboard.yaml --chart revenue-by-region`

PNG output requires Chrome/Chromium installed. Use `--as html` for HTML output without Chrome. Use `--width` and `--height` to control PNG dimensions (default: 800x600).

### `dashcli export <spec.yaml> [--out dir]`

Exports a self-contained HTML file with ECharts and all data embedded. Works offline, no server needed.

### `dashcli profile <source>`

Outputs column classification as JSON — types, cardinality, sample values. Useful for agent composability.

### `dashcli create [name]`

Scaffolds a new dashboard with sample data (`sales.csv`) and a ready-to-edit YAML spec.

### `dashcli read <spec.yaml>`

Parses a YAML spec and outputs a structured summary: name, title, source, charts (id, type, position), filters, and layout. Works offline with no API key.

### `dashcli diff <specA> <specB>`

Compares two dashboard specs and outputs a structured changelog keyed by chart/filter ID — added, removed, and changed items with field-level detail.

### `dashcli version [--check]`

Prints the current version. Add `--check` to also check for updates against the remote.

### `dashcli upgrade`

Upgrades dashcli to the latest version. Detects git clone vs vendored install, fetches and resets to latest, runs setup, and shows what's new from the changelog.

| Flag | Effect |
|------|--------|
| `--snooze` | Defer upgrade reminders with escalating backoff (24h, 48h, 1 week) |
| `--auto` | Upgrade now and enable auto-upgrade for future updates |
| `--disable-check` | Disable update checks entirely |
| `--enable-check` | Re-enable update checks |

### `dashcli config [get|set|list]`

Manage dashcli configuration. Config is stored at `~/.dashcli/.config.yaml`.

```bash
dashcli config                        # list all config values
dashcli config get auto_upgrade       # get a specific value
dashcli config set auto_upgrade true  # set a value (true/false)
```

Available keys: `auto_upgrade` (auto-upgrade before commands), `update_check` (enable/disable version checks).

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
  render.ts       Single chart render (PNG/HTML)
  suggest.ts      Heuristic + AI-powered spec generation
  profiler.ts     Column classification + type inference
  utils.ts        Shared utilities
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
