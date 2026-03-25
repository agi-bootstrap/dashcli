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

export const ChartSpec = z.object({
  id: z.string(),
  type: z.enum(["bar", "line", "kpi", "table", "pie", "scatter", "gauge", "area", "stacked_bar", "heatmap", "funnel"]),
  query: z.string(),
  position: Position,
  x: z.string().optional(),
  y: z.string().optional(),
  label: z.string().optional(),
  format: z.enum(["currency", "number", "percent"]).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  group: z.string().optional(),
  value: z.string().optional(),
}).refine(
  (c) => !["pie", "scatter", "bar", "line", "area", "stacked_bar", "heatmap", "funnel"].includes(c.type) || (c.x != null && c.y != null),
  { message: "x and y are required for pie, scatter, bar, line, area, stacked_bar, heatmap, and funnel charts" },
).refine(
  (c) => c.type !== "stacked_bar" || c.group != null,
  { message: "group is required for stacked_bar charts" },
).refine(
  (c) => c.type !== "heatmap" || c.value != null,
  { message: "value is required for heatmap charts" },
);

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

export type DashboardSpec = z.infer<typeof DashboardSpec>;
export type ChartSpec = z.infer<typeof ChartSpec>;
export type FilterSpec = z.infer<typeof FilterSpec>;
