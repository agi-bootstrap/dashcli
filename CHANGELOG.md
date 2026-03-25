# Changelog

All notable changes to dashcli will be documented in this file.

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
