# Changelog

All notable changes to dashcli will be documented in this file.

## [0.1.1.0] - 2026-03-22

### Added
- 3 new chart types: pie (donut), scatter, and gauge
- Pie chart with accent color opacity variations and donut layout (40%/70% radius)
- Scatter chart with value axes on both X/Y and 8px symbols
- Gauge chart with single-value arc, pointer, configurable min/max, and formatted detail
- Sample all-charts-dashboard.yaml exercising all 7 chart types on a 3×3 grid
- Schema validation: x/y fields required for pie, scatter, bar, and line charts
- 29 new tests across schema validation and HTML rendering (71 total)

### Fixed
- Axis label color consistency: bar/line/scatter charts now use #737373 (WCAG AA compliant)
- Scatter tooltip shows both axis field names with formatted values

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
