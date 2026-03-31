# Changelog

All notable changes to dashcli will be documented in this file.

## [0.9.0] - 2026-03-30

### Added
- **`dashcli render` command.** Render a single chart as a PNG image or self-contained HTML file. Works with standalone chart specs or extracts one chart from a dashboard spec via `--chart <id>`. PNG output uses Chrome headless screenshot (zero new npm dependencies). HTML available via `--as html`.
- **Standalone chart spec.** New minimal YAML format for individual charts: `source` + `chart` (no layout, filters, or position). File convention: `*.chart.yaml`. Validated with Zod via `StandaloneChartSpec`.
- **`dashcli suggest --charts-dir <dir>`.** Writes individual `.chart.yaml` files alongside the dashboard spec. Filter placeholders are resolved to `1=1` so chart files work independently.
- **Separate Zod types for dashboard vs standalone charts.** `ChartSpec` (with position) for dashboards, `StandaloneChartFields` (no position) for standalone specs. No shared optional position, preventing null-destructure bugs.
- 26 new tests covering schema validation, spec type detection, HTML render, chart file generation, and error paths.

### Changed
- `schema.ts` refactored to share chart field definitions between `ChartSpec` and `StandaloneChartFields` via extracted `chartFields` object.

## [0.8.0] - 2026-03-29

### Added
- **Config system.** New `dashcli config [get|set|list]` command with `--json` support. YAML config at `~/.dashcli/.config.yaml` with atomic writes and corrupt-file recovery. Migrates from the old `.update-check-disabled` flag file automatically.
- **Auto-upgrade from cache.** Set `dashcli config set auto_upgrade true` and dashcli silently upgrades before any command when a cached update is available. Guarded by TTY check (never runs in pipes or CI). Never fetches from network, only acts on cached results.
- **Upgrade consent flags.** `dashcli upgrade --snooze` defers with escalating backoff (24h, 48h, 1 week). `--auto` upgrades and enables auto-upgrade. `--disable-check` / `--enable-check` toggle version checking.
- **Semver comparison.** `checkForUpdate()` now compares versions numerically, preventing silent downgrades when local is ahead of remote.

### Changed
- **Robust git upgrade.** `upgradeGit()` now uses `git fetch origin main` + `git reset --hard origin/main` instead of `git pull`, eliminating merge conflict failures on install directories.
- **Serve hint updated** to mention `--snooze` option for deferring upgrades.

## [0.7.0] - 2026-03-29

> Versioning switched from 4-digit (0.1.X.Y) to standard semver (MAJOR.MINOR.PATCH) starting this release.
> Pre-1.0: MINOR = new features or breaking changes, PATCH = bug fixes and docs.
> Post-1.0: MAJOR = breaking changes, MINOR = new features, PATCH = bug fixes.

### Added
- `dashcli version [--check]` — prints current version, optionally checks for updates against remote
- `dashcli upgrade` — self-update command, detects git clone vs vendored install, pulls latest, runs setup, shows changelog
- Non-blocking upgrade hint on `dashcli serve` startup when a new version is available
- Version check cache with mtime-based TTL (60min up-to-date, 720min upgrade-available)
- Snooze with escalating backoff (24h, 48h, 7 days) — resets when a new version drops
- Update check disable flag at `~/.dashcli/.update-check-disabled`
- Post-upgrade marker shows changelog on next `dashcli version`
- Vendored upgrade with backup-and-restore on failure
- JSON envelope support (`--json`) for both version and upgrade commands
- 68 new tests covering all upgrade paths, cache/snooze logic, CLI integration, and corner cases

### Changed
- `.gitignore` updated with upgrade state file patterns
- README updated with "Updating" section and new command documentation

## [0.1.6.0] - 2026-03-27

### Added
- **One-command dashboard:** `dashcli data.csv` profiles the data, generates a spec, serves it, and opens the browser. No intermediate files, no YAML visible. Also works as `dashcli dashboard data.csv`.
- `startServerFromSpec()` — in-memory serve path that accepts a DashboardSpec object directly, bypassing YAML serialization to disk. Aligns with the "YAML is invisible plumbing" strategy.
- `loadDashboardFromSpec()` — loads dashboard context from an in-memory spec + data source path.
- `createFetchHandler()` — shared request handler extracted from `startServer` and `startServerFromSpec`, eliminating 120 lines of duplication.
- Server lifecycle management: kills previous dashcli server on the same port, cleans up on SIGINT/SIGTERM.
- Cross-platform browser opening (macOS `open`, Linux `xdg-open`, Windows `start`).
- 9 new tests: in-memory serve, end-to-end pipeline (all charts return data), CLI integration, error paths.
- JSON output support for the dashboard command (`--json` flag).

### Changed
- Dropdown value precomputation extracted to shared `computeDropdownValues()` function (DRY).

## [0.1.5.0] - 2026-03-26

### Added
- Heuristic `dashcli suggest` — zero-config default that generates a dashboard spec from any CSV/JSON without an API key, under 100ms
- `dashcli profile` command — outputs column classification as JSON for agent composability
- `--ai` flag for `dashcli suggest` — opt-in to LLM-powered suggest (requires `ANTHROPIC_API_KEY`)
- Column profiler: classifies columns as date/measure/dimension with ID guards, cardinality analysis, and null column exclusion
- Label humanization: chart titles derived from column names (`total_revenue` → `Total Revenue`)
- KPI format detection: currency/percent/number inferred from column name patterns
- 35 new tests covering profiler, heuristic suggest, CLI integration, and determinism

### Changed
- `dashcli suggest` no longer requires `ANTHROPIC_API_KEY` by default — heuristic mode is the new default
- `suggestDashboards()` renamed to `suggestAI()` — returns YAML string to stdout instead of writing files
- `--out` flag removed from suggest (both modes output to stdout)
- CSV type inference upgraded from single-row to multi-row sampling (up to 10 non-empty values per column)
- `escId()` and `deriveTableName()` consolidated into shared `src/utils.ts` — removed 4 duplicate copies

## [0.1.4.0] - 2026-03-26

### Changed
- Chart types consolidated to `custom | kpi | table` — single `renderEChartsOption()` replaces 8 legacy per-type renderers
- `custom` type accepts raw ECharts `option` object with data binding tokens (`$rows`, `$rows.column`, `$row0.column`, `$distinct.column`)
- `dashcli suggest` system prompt updated to generate `custom` charts with dataset/encode patterns and theme documentation
- `max_tokens` increased from 4096 to 8192 for richer custom chart output
- All sample dashboards rewritten to use `custom | kpi | table` types

### Added
- ECharts theme registration (`dashcli` theme) with design system colors, grid defaults, and per-series-type styling
- Column-not-found warning: visible amber banner on chart card + console.warn when data binding references a missing column
- Empty data guard for custom charts: shows "No data" message instead of blank axes
- ResizeObserver lifecycle management (`chartObservers` map) — observers cleaned up on instance dispose
- CSS custom properties `--border-light` and `--hover` replacing hardcoded colors
- `.dashcli-column-warning` and `.table-overflow` CSS classes replacing inline styles
- `text-wrap: balance` on dashboard title, `transition` on table row hover

### Fixed
- Filter input padding aligned to 4px grid (10px → 12px)
- Header/filter-bar background extends full-width on ultra-wide screens
- Warning banner and table overflow text use CSS classes instead of inline styles

### Removed
- 8 legacy per-type rendering functions (`renderEChart`, `renderPieChart`, `renderScatterChart`, `renderGaugeChart`, `renderStackedBarChart`, `renderHeatmapChart`, `renderFunnelChart`, `renderCustomChart`)
- Legacy chart type enum values (`bar`, `line`, `pie`, `scatter`, `gauge`, `area`, `stacked_bar`, `heatmap`, `funnel`)
- Legacy fields `x`, `y`, `group`, `value`, `min`, `max` from ChartSpec schema
- Legacy type-specific refinements (x/y required, group required for stacked_bar, value required for heatmap)

## [0.2.0] - 2026-03-24

### Added
- `dashcli read <spec>` command — parse a YAML spec and output a structured summary (name, title, charts, filters, layout). Works offline with no API key
- `dashcli diff <specA> <specB>` command — compare two specs and output a structured changelog keyed by chart/filter ID (added, removed, changed with field names)
- `--json` flag on all commands — outputs machine-readable JSON envelope: `{ ok, data, error: { message, code, context } }`
- `--format <text|json>` flag for output format control (`--json` always wins)
- JSON Schema publication — `bun run gen:schema` generates `schema/dashboard-spec.schema.json` from the Zod spec
- Structured error codes: `SPEC_VALIDATION`, `FILE_NOT_FOUND`, `YAML_PARSE_ERROR`, `DATA_SOURCE_ERROR`, `RUNTIME_ERROR`, `UNKNOWN_COMMAND`
- Exit code mapping: 0=success, 1=validation/file error, 2=data source error, 3=runtime error
- Chart ID uniqueness validation in schema (rejects duplicate chart IDs)
- File size check (100MB limit) with clear error message suggesting DuckDB for large datasets
- 56 new tests across 4 test files (cli-utils, read, diff, json-output) — 196 total

### Fixed
- CSV type inference now samples up to 10 rows instead of just the first row, preventing mistyped columns when the first row has atypical values
- Row coercion uses the multi-row inferred column type instead of re-inferring from row 0
- `exportDashboard()` now returns the output file path for `--json` mode support

## [0.1.3.0] - 2026-03-25

### Added
- 4 new chart types: `area` (filled line), `stacked_bar` (multi-series composition), `heatmap` (two-axis intensity grid), `funnel` (stage progression)
- 3 new filter types: `multi_select` (pick multiple values, IN clause), `range` (numeric min/max, BETWEEN), `text` (free text search, LIKE with escaped wildcards)
- `group` field for stacked_bar charts, `value` field for heatmap charts
- Sample dashboard (`all-charts-dashboard.yaml`) showcasing all 11 chart types and 4 filter types
- Export support for all new chart and filter types
- Empty-data guards on all new chart renderers
- Accessibility: `aria-label` on all new filter inputs, `flex-wrap` on filter bar for 5+ filters
- CSS: `cursor: pointer` on select inputs, `transition: border-color 150ms` on filter focus
- Multi-select uses repeated URL params (handles values containing commas)
- Range filter swaps min/max when inverted, falls back to 1=1 on NaN/empty
- Text filter escapes `%` and `_` to prevent LIKE wildcard injection
- Multi-select IN clause capped at 100 values
- 57 new tests covering schema validation, query interpolation, viewer rendering, server parsing, and export integration

### Changed
- Updated `dashcli suggest` system prompt to include new chart and filter types
- DESIGN.md updated with specs for all new chart and filter types

## [0.1.2.1] - 2026-03-23

### Added
- README with install instructions, quick start, CLI command reference, dashboard spec format, chart types table, filter interpolation docs, project structure, and development workflow

## [0.1.2.0] - 2026-03-23

### Added
- Live reload via Server-Sent Events (SSE) — dashboard auto-refreshes when spec or data files change
- Faster filter response — inputs are debounced (150ms) so rapid typing no longer floods the server
- Exported HTML gracefully skips live reload (SSE requires a server; `file://` opens still work)
- `dashcli suggest <source>` command for AI-powered dashboard generation from CSV/JSON data
- Analyzes data schema (column types, cardinality, value ranges) and sends to Claude API
- Generates 3-5 dashboard YAML specs with appropriate chart types, filters, and layouts
- `--out <dir>` flag to control output directory for generated specs
- LLM trust boundary hardening: path traversal sanitization on spec names, Zod validation on all generated specs, truncation detection
- Name deduplication for generated specs (appends `-2`, `-3`, etc.)
- `@anthropic-ai/sdk` and `yaml` dependencies
- 20 new tests covering suggest workflow, YAML parsing, schema summary, path traversal, truncation, name dedup

### Fixed
- `fs.watch` dies silently after atomic save on macOS — re-creates watcher on `rename` events
- Null values in numeric table columns displayed as "0" instead of empty cell
- KPI cards excessive height on mobile (242px → 113px, 53% reduction)
- Numeric table columns left-aligned — now right-aligned with `.num` class
- Table header letter-spacing inconsistent (0.3px → 0.5px per DESIGN.md)
- Filter inputs now use `<label>` elements with `for` attributes for accessibility
- Date range inputs include `aria-label` for screen readers
- KPI values use `font-variant-numeric: tabular-nums` per DESIGN.md
- Table header `letter-spacing` aligned to 0.5px matching card titles

## [0.1.1.0] - 2026-03-22

### Added
- 3 new chart types: **pie** (donut), **scatter**, and **gauge** — dashcli now supports 7 chart types
- Pie charts display proportions as a donut with accent-color opacity gradations
- Scatter charts plot two numeric fields with formatted tooltips showing both axes
- Gauge charts show a single metric against a configurable min/max range with formatted values
- New `all-charts-dashboard.yaml` sample demonstrating all 7 chart types on a 3×3 grid
- Schema now validates that pie, scatter, bar, and line charts include required x/y fields
- DataSource interface abstracting data loading from file format
- JSON file source adapter (array-of-objects → SQLite, with type inference)
- Auto-detection of data source by file extension (.csv → CSV, .json → JSON)
- Validation: nested objects/arrays in JSON throw clear errors
- Multi-dot filename support (e.g., `sales.2024.csv` → table `sales.2024`)
- `dashcli export <spec.yaml> [--out dir]` command for self-contained HTML output
- Inlines ECharts library and pre-computed query results as embedded JSON
- Exported files work fully offline with no server needed
- Export date shown in subtitle for provenance tracking
- `--out` flag validation (requires directory argument)
- 29 new tests (71 total) covering schema validation and HTML rendering for all chart types
- 18 new hardening tests across 6 files
- 19 new tests: JSON adapter (9), auto-detection (8), table name derivation (4)

### Changed
- `server.ts` uses `loadDataSource()` instead of direct `loadCsv()` call
- Table name derivation centralized in `deriveTableName()` (strips only known extensions)

### Fixed
- Axis label color consistency: bar/line/scatter charts now use #737373 (WCAG AA compliant)
- Scatter tooltip shows both axis field names with formatted values
- Escape single quotes in HTML output to prevent XSS (#22)
- Mask SQL error details in API responses — return generic "Query failed" (#9)
- Stop reflecting URL input in API error responses (#8)
- Add security headers (X-Content-Type-Options, X-Frame-Options) to all responses (#10)
- Return 204 for /favicon.ico to suppress browser console 404 noise (#14)
- Validate --port flag as integer in 1-65535 range (#4)
- Show "No data" message for empty bar/line charts (#15)
- Non-functional filter bar hidden in exported HTML (filters require a server)

### Changed
- Deduplicate table name derivation between csv.ts and server.ts (#16)
- Axis label color #999 → #737373 to match design system --text-muted token
- Pagination text color #999 → #737373 for consistency
- H1 line-height set to 1.2 per DESIGN.md

## [0.1.0.0] - 2026-03-22

### Added
- CLI with `dashcli create [name]` to scaffold a new dashboard from sample data
- CLI with `dashcli serve <spec.yaml>` to launch the web viewer
- CSV data source with in-memory SQLite for querying
- YAML-based dashboard spec with Zod schema validation
- 4 chart types: bar, line, KPI, table (ECharts for bar/line)
- Interactive filters: date range picker, dropdown with dynamic values from data
- Responsive layout with mobile breakpoint at 768px
- DESIGN.md with extracted design system (system fonts, 4px spacing, single accent)
- 48 tests across 7 files (CSV, query, schema, server, viewer, CLI, edge cases)

### Fixed
- XSS prevention: HTML escaping in KPI values, table cells, chart error messages
- SQL identifier escaping to prevent injection via column/table names
- Server binds to 127.0.0.1 (localhost only) for security
- CSV parser handles Windows CRLF line endings
- NaN fallback in integer coercion preserves original string value
- `dashcli create` prevents overwriting existing specs and updates name field
- Table numbers formatted with toLocaleString for readability
- WCAG AA contrast compliance (muted text #999 → #737373, 4.84:1 ratio)
- Touch targets increased to 44px minimum on filter inputs
- Focus-visible ring added for keyboard accessibility
- Chart containers given adequate min-height (180px)
- Layout capped at 1440px max-width for ultrawide screens
- Tabular-nums applied to data table for aligned number columns
