/** Escape a SQL identifier by doubling internal double-quotes. */
export function escId(s: string): string {
  return s.replace(/"/g, '""');
}

/** Derive a SQL-safe table name from a file path (strip known extensions). */
export function deriveTableName(filePath: string): string {
  const filename = filePath.split("/").pop()!;
  const ext = filename.match(/\.(csv|json)$/i)?.[0] ?? "";
  return escId(filename.slice(0, filename.length - ext.length));
}

/** Convert a column name to a human-readable label: total_revenue → Total Revenue */
export function humanizeLabel(name: string): string {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
