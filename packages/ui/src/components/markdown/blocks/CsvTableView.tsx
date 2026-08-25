import { isTotalRow, type CsvTable } from "../logic/csvParse";

/**
 * Render a parsed CSV/TSV as a scrollable table (headers + rows, total rows
 * emphasised). Shared by the `ArtifactPanel`. Presentation only. Styling lives in
 * the `.md-csv*` rules.
 */
export function CsvTableView({ table }: { table: CsvTable }) {
  return (
    <div className="md-csv-scroll">
      <table className="md-csv">
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri} className={isTotalRow(r) ? "is-total" : undefined}>
              {r.map((c, ci) => (
                <td key={ci}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
