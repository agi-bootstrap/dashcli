# Changelog

All notable changes to dashcli will be documented in this file.

## [0.1.1.0] - 2026-03-22

### Fixed
- Escape single quotes in HTML output to prevent XSS (#22)
- Mask SQL error details in API responses — return generic "Query failed" (#9)
- Stop reflecting URL input in API error responses (#8)
- Add security headers (X-Content-Type-Options, X-Frame-Options) to all responses (#10)
- Return 204 for /favicon.ico to suppress browser console 404 noise (#14)
- Validate --port flag as integer in 1-65535 range (#4)
- Show "No data" message for empty bar/line charts (#15)

### Changed
- Deduplicate table name derivation between csv.ts and server.ts (#16)
- Axis label color #999 → #737373 to match design system --text-muted token
- Pagination text color #999 → #737373 for consistency
- H1 line-height set to 1.2 per DESIGN.md

### Added
- 18 new tests across 6 files (66 total, 0 failures)

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
