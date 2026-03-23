# Changelog

All notable changes to dashcli will be documented in this file.

## [0.1.1.0] - 2026-03-22

### Added
- DataSource interface abstracting data loading from file format
- JSON file source adapter (array-of-objects → SQLite, with type inference)
- Auto-detection of data source by file extension (.csv → CSV, .json → JSON)
- Validation: nested objects/arrays in JSON throw clear errors
- Multi-dot filename support (e.g., `sales.2024.csv` → table `sales.2024`)
- 19 new tests: JSON adapter (9), auto-detection (8), table name derivation (4)

### Changed
- `server.ts` uses `loadDataSource()` instead of direct `loadCsv()` call
- Table name derivation centralized in `deriveTableName()` (strips only known extensions)

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
