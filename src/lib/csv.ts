/** Builds a CSV (RFC 4180) from a header row and data rows. Text a
 *  spreadsheet would run as a formula (starting with = + - @) is prefixed
 *  with ' so it stays text; plain numbers and phone numbers are left as is. */
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'string' ? v : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Saves a CSV file in the browser. The BOM makes Excel read UTF-8 (ä, ö, é). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
