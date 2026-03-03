"use client";

/**
 * DataTable — consistent table wrapper
 * @param {object} props
 * @param {{key:string, label:string|React.ReactNode, align?:string}[]} props.columns
 * @param {Array<object>} props.rows
 * @param {(row:object, col:{key:string}, idx:number)=>React.ReactNode} [props.renderCell]
 * @param {(row:object, idx:number)=>void} [props.onRowClick]
 * @param {string} [props.emptyText]
 */
export default function DataTable({ columns, rows, renderCell, onRowClick, emptyText = "Sem dados." }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.align ? { textAlign: col.align } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length}>{emptyText}</td></tr>
          ) : rows.map((row, idx) => (
            <tr
              key={row.id || row.symbol || idx}
              onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
              style={onRowClick ? { cursor: "pointer" } : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} style={col.align ? { textAlign: col.align } : undefined}>
                  {renderCell ? renderCell(row, col, idx) : (row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
