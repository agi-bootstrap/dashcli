import { z } from "zod";

// Position: [col_start, row_start, col_span, row_span] (0-indexed)
const Position = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const FilterSpec = z.object({
  id: z.string(),
  type: z.enum(["date_range", "dropdown"]),
  column: z.string(),
  default: z.union([
    z.tuple([z.string(), z.string()]), // date_range: [start, end]
    z.string(), // dropdown: "all" or specific value
  ]),
});

export const ChartSpec = z.object({
  id: z.string(),
  type: z.enum(["bar", "line", "kpi", "table"]),
  query: z.string(),
  position: Position,
  x: z.string().optional(),
  y: z.string().optional(),
  label: z.string().optional(),
  format: z.enum(["currency", "number", "percent"]).optional(),
});

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
