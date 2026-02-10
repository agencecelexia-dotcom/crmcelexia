import Papa from 'papaparse'

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
  rowCount: number
  errors: Papa.ParseError[]
}

export function parseCSVFile(file: File): Promise<ParsedCSV> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete(results) {
        const headers = results.meta.fields ?? []
        const rows = results.data as Record<string, string>[]
        resolve({
          headers,
          rows,
          rowCount: rows.length,
          errors: results.errors,
        })
      },
      error(error) {
        reject(error)
      },
    })
  })
}

export function validatePhone(phone: string): boolean {
  if (!phone) return false
  const cleaned = phone.replace(/[\s\-\.\(\)]/g, '')
  // French phone: 10 digits starting with 0, or +33 format
  return /^(0\d{9}|\+33\d{9}|\+\d{7,15})$/.test(cleaned)
}

export function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-\.\(\)]/g, '').trim()
}

export interface ValidationResult {
  valid: Record<string, string>[]
  invalid: { row: number; data: Record<string, string>; reason: string }[]
}

export function validateImportRows(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): ValidationResult {
  const valid: Record<string, string>[] = []
  const invalid: { row: number; data: Record<string, string>; reason: string }[] = []

  rows.forEach((row, index) => {
    const mapped: Record<string, string> = {}
    for (const [csvCol, dbField] of Object.entries(mapping)) {
      if (dbField && row[csvCol] !== undefined) {
        mapped[dbField] = row[csvCol].trim()
      }
    }

    // Required: company_name
    if (!mapped.company_name) {
      invalid.push({ row: index + 1, data: row, reason: 'Nom entreprise manquant' })
      return
    }

    // Required: phone
    if (!mapped.phone) {
      invalid.push({ row: index + 1, data: row, reason: 'Téléphone manquant' })
      return
    }

    // Clean phone
    mapped.phone = cleanPhone(mapped.phone)

    valid.push(mapped)
  })

  return { valid, invalid }
}
