import { describe, it, expect } from "bun:test";
import { renderDashboardHtml } from "../src/viewer";
import type { DashboardSpec } from "../src/schema";

describe("escHtml escapes single quotes (#22)", () => {
  it("escapes single quotes in dashboard title", () => {
    const spec: DashboardSpec = {
      name: "test",
      title: "Bob's Dashboard",
      source: "./test.csv",
      refresh: "manual",
      filters: [],
      layout: { columns: 1, rows: "auto" },
      charts: [
        { id: "k1", type: "kpi", query: "SELECT 1", label: "Test", position: [0, 0, 1, 1] },
      ],
    };
    const html = renderDashboardHtml(spec);
    expect(html).toContain("Bob&#39;s Dashboard");
    // The <h1> and <title> should use the escaped form
    expect(html).toContain("<h1>Bob&#39;s Dashboard</h1>");
  });

  it("escapes all five HTML-sensitive characters", () => {
    const spec: DashboardSpec = {
      name: "test",
      title: 'A & B < C > D "E" \'F\'',
      source: "./test.csv",
      refresh: "manual",
      filters: [],
      layout: { columns: 1, rows: "auto" },
      charts: [
        { id: "k1", type: "kpi", query: "SELECT 1", label: "Test", position: [0, 0, 1, 1] },
      ],
    };
    const html = renderDashboardHtml(spec);
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&#39;");
  });
});
