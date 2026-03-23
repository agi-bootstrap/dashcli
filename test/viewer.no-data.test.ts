import { describe, it, expect } from "bun:test";
import { renderDashboardHtml } from "../src/viewer";
import type { DashboardSpec } from "../src/schema";

const spec: DashboardSpec = {
  name: "test",
  title: "Test",
  source: "./test.csv",
  refresh: "manual",
  filters: [],
  layout: { columns: 1, rows: "auto" },
  charts: [
    { id: "bar1", type: "bar", query: "SELECT 1", label: "Bar", x: "x", y: "y", position: [0, 0, 1, 1] },
    { id: "line1", type: "line", query: "SELECT 1", label: "Line", x: "x", y: "y", position: [0, 1, 1, 1] },
  ],
};

describe("empty chart 'No data' message (#15)", () => {
  const html = renderDashboardHtml(spec);

  it("renderEChart function handles empty data with 'No data' message", () => {
    // The client-side renderEChart function should check data.length
    // and show "No data" when there are no results
    expect(html).toContain("if (!data.length)");
    expect(html).toContain("No data");
  });

  it("table renderTable already shows 'No data' for empty results", () => {
    expect(html).toContain("No data");
  });
});
