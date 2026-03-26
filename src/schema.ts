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
  type: z.enum(["custom", "kpi", "table"]),
  query: z.string(),
  position: Position,
  label: z.string().optional(),
  format: z.enum(["currency", "number", "percent"]).optional(),
  option: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (c) => c.type !== "custom" || c.option != null,
  { message: "option is required for custom charts" },
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
});

export type DashboardSpec = z.infer<typeof DashboardSpec>;
export type ChartSpec = z.infer<typeof ChartSpec>;
export type FilterSpec = z.infer<typeof FilterSpec>;
