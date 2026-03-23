// Regression: ISSUE-002 — Dashboard not responsive on mobile viewports
// Found by /qa on 2026-03-22
// Report: .gstack/qa-reports/qa-report-localhost-3838-2026-03-22.md

import { describe, it, expect } from "bun:test";
import { renderDashboardHtml } from "../src/viewer";
import type { DashboardSpec } from "../src/schema";

const spec: DashboardSpec = {
  name: "test",
  title: "Test Dashboard",
  source: "./test.csv",
  refresh: "manual",
  filters: [
    { id: "date_range", type: "date_range", column: "date", default: ["2025-01-01", "2025-12-31"] },
    { id: "region", type: "dropdown", column: "region", default: "all" },
  ],
  layout: { columns: 3, rows: "auto" },
  charts: [
    { id: "kpi1", type: "kpi", query: "SELECT 1", label: "KPI", format: "number", position: [0, 0, 1, 1] },
    { id: "bar1", type: "bar", query: "SELECT 1", label: "Bar", x: "x", y: "y", position: [1, 0, 2, 1] },
  ],
};

describe("viewer responsive layout", () => {
  const html = renderDashboardHtml(spec);

  it("includes mobile media query with max-width 768px", () => {
    expect(html).toContain("@media (max-width: 768px)");
  });

  it("collapses grid to single column on mobile", () => {
    expect(html).toContain("grid-template-columns: 1fr !important");
  });

  it("overrides card grid-column to full width on mobile", () => {
    expect(html).toContain("grid-column: 1 / -1 !important");
  });

  it("allows filter bar to wrap on mobile", () => {
    expect(html).toContain("flex-wrap: wrap");
  });

  it("preserves desktop grid columns in base styles", () => {
    expect(html).toContain("grid-template-columns: repeat(3, 1fr)");
  });
});
