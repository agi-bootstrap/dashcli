import { z } from "zod";

// Position: [col_start, row_start, col_span, row_span] (0-indexed)
const Position = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const FilterSpec = z.object({
  id: z.string(),
  type: z.enum(["date_range", "dropdown", "multi_select", "range", "text"]),
  column: z.string(),
  default: z.union([
    z.tuple([z.string(), z.string()]), // date_range: [start, end]
    z.string(), // dropdown or text: "all" or specific value
    z.array(z.string()), // multi_select: selected values (empty = no filter)
    z.tuple([z.number(), z.number()]), // range: [min, max]
  ]),
});

// Shared chart fields (no position — used by both dashboard and standalone specs)
const chartFields = {
  id: z.string(),
  type: z.enum(["custom", "kpi", "table"]),
  query: z.string(),
  label: z.string().optional(),
  format: z.enum(["currency", "number", "percent"]).optional(),
  option: z.record(z.string(), z.unknown()).optional(),
};

const chartOptionRefine = {
  fn: (c: { type: string; option?: unknown }) => c.type !== "custom" || c.option != null,
  message: "option is required for custom charts",
};

// Dashboard chart: includes position for grid layout
export const ChartSpec = z.object({
  ...chartFields,
  position: Position,
}).refine(chartOptionRefine.fn, { message: chartOptionRefine.message });

// Standalone chart fields: no position (used inside StandaloneChartSpec)
export const StandaloneChartFields = z.object(chartFields)
  .refine(chartOptionRefine.fn, { message: chartOptionRefine.message });

export const LayoutSpec = z.object({
  columns: z.number().default(3),
  rows: z.literal("auto").default("auto"),
});

export const DashboardSpec = z.object({
  name: z.string(),
  title: z.string(),
  source: z.string(),
  refresh: z.enum(["manual"]).default("manual"),
  filters: z.array(FilterSpec).default([]),
  layout: LayoutSpec,
  charts: z.array(ChartSpec),
}).refine(
  (spec) => {
    const ids = spec.charts.map((c) => c.id);
    return new Set(ids).size === ids.length;
  },
  { message: "Chart IDs must be unique" },
).refine(
  (spec) => {
    const ids = spec.filters.map((f) => f.id);
    return new Set(ids).size === ids.length;
  },
  { message: "Filter IDs must be unique" },
);

// Standalone chart spec: source + single chart, no layout/filters/position
export const StandaloneChartSpec = z.object({
  source: z.string(),
  chart: StandaloneChartFields,
});

export type DashboardSpec = z.infer<typeof DashboardSpec>;
export type ChartSpec = z.infer<typeof ChartSpec>;
export type FilterSpec = z.infer<typeof FilterSpec>;
export type StandaloneChartFields = z.infer<typeof StandaloneChartFields>;
export type StandaloneChartSpec = z.infer<typeof StandaloneChartSpec>;
