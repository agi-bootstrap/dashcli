import { describe, it, expect, afterAll } from "bun:test";
import { exportDashboard } from "../src/export";
import { resolve } from "path";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";

const specPath = resolve(import.meta.dir, "../sample/all-charts-dashboard.yaml");
const outDir = tmpdir();
const outFile = resolve(outDir, "all-charts-dashboard.html");

let html = "";

// Export once, then run all assertions against the output
describe("export integration", () => {
  it("exports dashboard with all chart types to valid HTML", async () => {
    await exportDashboard(specPath, outDir);
    expect(existsSync(outFile)).toBe(true);
    html = readFileSync(outFile, "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  }, 30_000); // CDN fetch may be slow

  it("contains PRELOADED_DATA with new chart type data", () => {
    expect(html).toContain("PRELOADED_DATA");
    // New chart IDs from the all-charts-dashboard spec
    expect(html).toContain('"revenue_area"');
    expect(html).toContain('"revenue_stacked"');
    expect(html).toContain('"deal_funnel"');
    expect(html).toContain('"revenue_heatmap"');
  });

  it("contains PRELOADED_FILTERS for dropdown values", () => {
    expect(html).toContain("PRELOADED_FILTERS");
  });

  it("hides filter bar in exported HTML", () => {
    expect(html).toContain('class="filter-wrap" style="display:none"');
  });

  it("inlines ECharts source (no CDN script tag)", () => {
    expect(html).not.toContain('src="https://cdn.jsdelivr.net');
  });

  it("includes chart render functions for new types", () => {
    expect(html).toContain("renderStackedBarChart");
    expect(html).toContain("renderHeatmapChart");
    expect(html).toContain("renderFunnelChart");
  });

  it("includes export date stamp", () => {
    expect(html).toContain("dashcli export");
  });

  afterAll(() => {
    if (existsSync(outFile)) unlinkSync(outFile);
  });
});
