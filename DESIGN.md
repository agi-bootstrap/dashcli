# dashcli Design System

Extracted from the live dashboard on 2026-03-22. This is the source of truth for visual decisions.

## Philosophy

Restrained, data-first, zero decoration. The data is the interface. Every pixel either communicates information or provides structure — nothing is ornamental. Think Bloomberg Terminal meets a modern design sensibility.

## Color

### Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--text` | `#1a1a1a` | Primary text, headings, KPI values |
| `--text-secondary` | `#6b6b6b` | Table cell text, descriptions |
| `--text-muted` | `#737373` | Labels, card titles, table headers (WCAG AA: 4.84:1) |
| `--accent` | `#2563eb` | Chart bars, line charts, focus rings, interactive highlights |
| `--surface` | `#ffffff` | Cards, header, filter bar |
| `--bg` | `#fafafa` | Page background |
| `--border` | `#e2e2e2` | Card borders, input borders, table dividers |
| `--green` | `#16a34a` | Positive/success (reserved) |
| `--red` | `#dc2626` | Error states, negative values (reserved) |

### Rules

- **One accent color.** All interactive/data elements use `--accent`. No secondary accent.
- **Neutrals are cool-gray.** All grays derive from pure gray (equal RGB channels), not warm or blue-tinted.
- **No color-only encoding.** Always pair color with labels or icons.
- **Contrast floor:** All text on `--surface` must meet WCAG AA (4.5:1 for normal text, 3:1 for large text).

## Typography

### Font Stack

| Role | Stack |
|------|-------|
| Body | `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` |
| Mono | `"SF Mono", "Fira Code", ui-monospace, monospace` |

No web fonts. System fonts only. This is a developer tool — it should feel native.

### Scale

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Page title (H1) | 22px | 600 | One per page |
| KPI value | 36px | 700 | Largest element on page |
| Body / table text | 13px | 400 | Data density is high, 13px is acceptable for tabular data |
| Subtitle | 12px | 400 | Monospace, metadata only |
| Labels / card titles | 11px | 600 | Uppercase, letter-spacing 0.5px |

### Rules

- **Line height:** 1.5 (body default = 24px)
- **Headings:** 1.15–1.25 line-height
- **`font-variant-numeric: tabular-nums`** on all number columns for vertical alignment
- **No letterspacing on lowercase text.** Only on uppercase labels.
- **Max 2 font families.** System stack + monospace. Never add a third.

## Spacing

### Base Unit

`--sp: 4px`

All spacing derives from the 4px scale: 4, 8, 12, 16, 20, 24.

### Applied Values

| Context | Value | Calc |
|---------|-------|------|
| Card padding | 16px | `sp × 4` |
| Grid gap | 16px | `sp × 4` |
| Page padding | 24px | `sp × 6` |
| Header padding | 16px / 24px | `sp × 4` / `sp × 6` |
| Filter bar padding | 12px / 24px | `sp × 3` / `sp × 6` |
| Filter group gap | 8px | `sp × 2` |
| Card title margin-bottom | 12px | `sp × 3` |

### Rules

- **Never use arbitrary values.** All spacing must be a multiple of 4px.
- **Rhythm:** Related items closer (8–12px), sections further (16–24px).
- **Max content width:** 1440px with centered auto margins.

## Border Radius

| Element | Radius | Notes |
|---------|--------|-------|
| Cards | 8px | `sp × 2` |
| Inputs / selects | 4px | `sp × 1` |
| Bar chart tops | 4px | Top corners only |

**Rule:** Radius hierarchy — containers > controls > data elements. Never uniform.

## Interaction States

| State | Treatment |
|-------|-----------|
| Hover (table rows) | `background: #f8f9fa` |
| Focus (inputs) | `border-color: var(--accent)` |
| Focus-visible | `outline: 2px solid var(--accent); outline-offset: 1px` |
| Loading | Centered "Loading..." text in muted color |
| Error | Centered error message in `--red` |
| Empty | "No data" centered in muted color, "—" for KPI values |

### Touch Targets

All interactive elements (inputs, selects, buttons) must have a minimum height of **44px**.

## Layout

### Grid

- Dashboard uses CSS Grid with column count from YAML spec (`layout.columns`)
- Charts position via `grid-column` / `grid-row` from the `position` array: `[col_start, row_start, col_span, row_span]`
- Row min-height: 200px

### Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| ≤ 768px (mobile) | Single column, filter bar wraps, KPI font 28px |
| > 768px (desktop) | Full grid layout from YAML spec |

### Rules

- **No horizontal scroll** at any viewport.
- **Cards always full-width on mobile** (`grid-column: 1 / -1`).

## Charts (ECharts)

| Property | Value |
|----------|-------|
| Bar color | `--accent` (#2563eb) |
| Line color | `--accent` (#2563eb) |
| Pie style | Donut (40%/70% radius), accent with opacity variation per slice |
| Scatter style | 8px symbols, `--accent`, value axes on both X/Y |
| Gauge style | Single-value arc, 12px width, `--accent` fill, pointer in `--text` |
| Line width | 2.5px |
| Line style | Smooth, circle symbols (6px) |
| Bar radius | `[4, 4, 0, 0]` (top corners) |
| Grid padding | `{left: 16, right: 16, top: 16, bottom: 32, containLabel: true}` |
| Axis labels | 11px, #737373 (matches `--text-muted`) |
| Grid lines | #f0f0f0 |
| Tooltip | axis trigger (bar), item trigger (line/scatter) |
| Min container height | 180px |

### Additional Chart Types

| Type | Description |
|------|-------------|
| Area | Line chart with 15% opacity fill (`rgba(37, 99, 235, 0.15)`). Same smooth curves, 2.5px line width, and circle symbols as line chart. Uses ECharts `areaStyle`. |
| Stacked bar | Multi-series stacked bar chart. Each series uses accent color with opacity gradient from 1.0 (first group) to 0.3 (last group). Top stack gets rounded corners `[4, 4, 0, 0]`. Legend shown at bottom when ≤8 groups. Requires `group` field in spec. |
| Heatmap | Two-axis category grid with intensity coloring. Gradient from `#f0f4ff` (min) to `#2563eb` (max). White cell borders (2px). Hidden visualMap. Requires `value` field in spec. |
| Funnel | Conversion funnel. Opacity gradient 0.3–1.0 on accent color, same pattern as pie chart. Centered at 80% width, white borders (2px). Requires x (label) and y (value). |

## Filters

Filter controls live in the filter bar. Existing types: `dropdown` and `date_range`.

### Additional Filter Types

| Type | Description |
|------|-------------|
| Multi-select | Native `<select multiple>` with max-height 88px. No "All" option; empty selection means no filter applied. Populated from API like dropdown. |
| Range | Two `<input type="number">` fields with arrow separator (same layout as date_range). Validates min ≤ max (auto-swaps), falls back to no-filter on empty/NaN. |
| Text | Single `<input type="text">` with "Search..." placeholder. Generates SQL LIKE with escaped wildcards. |

## Anti-Patterns (Do Not)

- No gradients, blobs, or decorative SVGs
- No colored left-border cards
- No icons in colored circles
- No emoji in UI
- No uniform border-radius (maintain hierarchy)
- No `text-align: center` on everything — left-align data
- No generic copy ("Welcome to...", "Unlock the power of...")
- No purple/indigo color schemes
- No `transition: all` — animate specific properties only
