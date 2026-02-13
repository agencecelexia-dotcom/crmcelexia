export function exportToCsv(filename: string, rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const header = columns.map((c) => c.label).join(';')
  const csvRows = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.key]
      if (val == null) return ''
      const str = String(val).replace(/"/g, '""')
      return str.includes(';') || str.includes('"') || str.includes('\n') ? `"${str}"` : str
    }).join(';')
  )

  const bom = '\uFEFF'
  const csv = bom + [header, ...csvRows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
