type CsvCell = string | number | boolean | null | undefined;
type CsvRow = Record<string, CsvCell>;

function escapeCsvCell(value: CsvCell): string {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    const needsQuoting = /[",\n\r;]/.test(stringValue);

    if (!needsQuoting) {
        return stringValue;
    }

    return `"${stringValue.replace(/"/g, '""')}"`;
}

interface ExportCsvOptions {
    filename: string;
    rows: readonly CsvRow[];
    headers?: readonly string[];
    headerLabels?: Record<string, string>;
}

export function exportRowsToCsv({ filename, rows, headers, headerLabels }: ExportCsvOptions): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (rows.length === 0) {
        return;
    }

    const columnKeys = headers ?? Object.keys(rows[0] ?? {});
    const headerRow = columnKeys
        .map((key) => escapeCsvCell(headerLabels?.[key] ?? key))
        .join(',');

    const bodyRows = rows.map((row) => columnKeys.map((key) => escapeCsvCell(row[key])).join(','));

    // BOM ensures Excel correctly detects UTF-8
    const csvContent = `﻿${[headerRow, ...bodyRows].join('\r\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = downloadUrl;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
}

export function buildCsvFilename(prefix: string, extension = 'csv'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${prefix}-${year}-${month}-${day}.${extension}`;
}
