export interface PdfExportOptions {
    filename: string;
    title: string;
    subtitle?: string;
    columns: readonly string[];
    rows: ReadonlyArray<ReadonlyArray<string | number>>;
    summary?: ReadonlyArray<{ label: string; value: string }>;
    orientation?: 'portrait' | 'landscape';
}

function escapeHtml(value: string | number): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const PRINT_STYLES = `
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
        color: #0f172a;
        background: #fff;
        padding: 32px 36px;
        font-size: 11px;
        line-height: 1.4;
    }
    .brand-strip {
        height: 4px;
        background: #0d9488;
        margin: -32px -36px 24px;
    }
    .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 20px;
    }
    .header-text h1 {
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin: 0 0 4px;
        color: #0f172a;
    }
    .header-text p {
        font-size: 12px;
        color: #64748b;
        margin: 0;
    }
    .header-brand {
        text-align: right;
        white-space: nowrap;
    }
    .header-brand .brand {
        font-size: 14px;
        font-weight: 700;
        color: #0d9488;
        margin: 0;
    }
    .header-brand .date {
        font-size: 10px;
        color: #94a3b8;
        margin: 2px 0 0;
    }
    .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
        margin-bottom: 18px;
    }
    .summary-card {
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        border-radius: 8px;
        padding: 10px 14px;
    }
    .summary-card .label {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748b;
        margin: 0 0 4px;
    }
    .summary-card .value {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        margin: 0;
        font-variant-numeric: tabular-nums;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
    }
    thead th {
        background: #f1f5f9;
        color: #64748b;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        text-align: left;
        padding: 10px 12px;
        border-top: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
    }
    thead th:first-child { border-left: 1px solid #e2e8f0; }
    thead th:last-child { border-right: 1px solid #e2e8f0; }
    tbody td {
        padding: 9px 12px;
        border-bottom: 1px solid #e2e8f0;
        font-variant-numeric: tabular-nums;
    }
    tbody td:first-child { border-left: 1px solid #e2e8f0; }
    tbody td:last-child { border-right: 1px solid #e2e8f0; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    tbody tr:nth-child(odd) td { background: #ffffff; }
    .footer {
        margin-top: 20px;
        font-size: 9px;
        color: #94a3b8;
        display: flex;
        justify-content: space-between;
    }
    @page { margin: 16mm; size: A4 landscape; }
    @media print { body { padding: 0; } .brand-strip { margin: 0 0 24px; } }
`;

function buildHtml({ title, subtitle, columns, rows, summary }: PdfExportOptions): string {
    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const headerHtml = `
        <div class="brand-strip"></div>
        <div class="header">
            <div class="header-text">
                <h1>${escapeHtml(title)}</h1>
                ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
            </div>
            <div class="header-brand">
                <p class="brand">Identa</p>
                <p class="date">${escapeHtml(dateStr)}</p>
            </div>
        </div>
    `;
    const summaryHtml = summary && summary.length > 0
        ? `<div class="summary">${summary
            .map((item) => `
                <div class="summary-card">
                    <p class="label">${escapeHtml(item.label)}</p>
                    <p class="value">${escapeHtml(item.value)}</p>
                </div>
            `)
            .join('')}</div>`
        : '';
    const tableHtml = `
        <table>
            <thead><tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('')}</tr></thead>
            <tbody>${rows
                .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
                .join('')}</tbody>
        </table>
    `;
    const footerHtml = `
        <div class="footer">
            <span>Identa Dental Management</span>
            <span>${escapeHtml(dateStr)}</span>
        </div>
    `;
    return headerHtml + summaryHtml + tableHtml + footerHtml;
}

export function exportRowsToPdf(options: PdfExportOptions): void {
    if (typeof window === 'undefined') {
        return;
    }

    const bodyHtml = buildHtml(options);
    const pageOrientation = options.orientation ?? 'landscape';
    const pageRule = `@page { margin: 16mm; size: A4 ${pageOrientation}; }`;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768');
    if (!printWindow) {
        // Popup blocked — fall back to current window using hidden iframe
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument;
        if (doc) {
            doc.open();
            doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(options.filename)}</title><style>${PRINT_STYLES}${pageRule}</style></head><body>${bodyHtml}</body></html>`);
            doc.close();
            iframe.onload = () => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 1000);
            };
        }
        return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(options.filename)}</title><style>${PRINT_STYLES}${pageRule}</style></head><body>${bodyHtml}</body></html>`);
    printWindow.document.close();

    const triggerPrint = () => {
        printWindow.focus();
        printWindow.print();
    };

    if (printWindow.document.readyState === 'complete') {
        setTimeout(triggerPrint, 200);
    } else {
        printWindow.addEventListener('load', () => setTimeout(triggerPrint, 200));
    }
}

export function buildPdfFilename(prefix: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${prefix}-${year}-${month}-${day}`;
}

export interface PatientReportSection {
    title: string;
    infoRows?: ReadonlyArray<{ label: string; value: string }>;
    table?: {
        columns: readonly string[];
        rows: ReadonlyArray<ReadonlyArray<string | number>>;
        emptyText?: string;
    };
}

export interface PatientReportOptions {
    filename: string;
    title: string;
    patientName: string;
    patientMeta?: ReadonlyArray<string>;
    summary?: ReadonlyArray<{ label: string; value: string; tone?: 'red' | 'green' | 'yellow' | 'blue' | 'neutral' }>;
    sections: ReadonlyArray<PatientReportSection>;
    orientation?: 'portrait' | 'landscape';
}

const TONE_COLORS = {
    red: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', label: '#b91c1c' },
    green: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', label: '#15803d' },
    yellow: { bg: '#fefce8', border: '#fde68a', text: '#854d0e', label: '#854d0e' },
    blue: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: '#1d4ed8' },
    neutral: { bg: '#f8fafc', border: '#e2e8f0', text: '#0f172a', label: '#64748b' },
} as const;

const PATIENT_REPORT_STYLES = `
    .patient-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 20px;
        background: linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%);
        border: 1px solid #99f6e4;
        border-radius: 12px;
        margin-bottom: 18px;
    }
    .patient-avatar {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
        color: #fff;
        font-size: 20px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    .patient-identity h2 {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #0f172a;
        margin: 0 0 4px;
    }
    .patient-meta {
        font-size: 11px;
        color: #64748b;
        margin: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
    }
    .patient-meta .dot { color: #cbd5e1; padding: 0 2px; }
    .section {
        margin-top: 16px;
        page-break-inside: avoid;
    }
    .section-title {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #0d9488;
        margin: 0 0 8px;
        padding-bottom: 5px;
        border-bottom: 2px solid #ccfbf1;
    }
    .info-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 4px 24px;
    }
    .info-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 5px 0;
        border-bottom: 1px dashed #f1f5f9;
        font-size: 10px;
    }
    .info-label { color: #64748b; font-weight: 500; }
    .info-value { color: #0f172a; font-weight: 600; text-align: right; }
    .empty-state {
        font-size: 10px;
        color: #94a3b8;
        font-style: italic;
        padding: 6px 0;
    }
`;

function buildPatientHtml(options: PatientReportOptions): string {
    const initials = options.patientName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');

    const patientCard = `
        <div class="patient-card">
            <div class="patient-avatar">${escapeHtml(initials)}</div>
            <div class="patient-identity">
                <h2>${escapeHtml(options.patientName)}</h2>
                ${options.patientMeta && options.patientMeta.length > 0
                    ? `<p class="patient-meta">${options.patientMeta
                        .map((m, idx) => idx > 0 ? `<span class="dot">·</span><span>${escapeHtml(m)}</span>` : `<span>${escapeHtml(m)}</span>`)
                        .join('')}</p>`
                    : ''}
            </div>
        </div>
    `;

    const summaryHtml = options.summary && options.summary.length > 0
        ? `<div class="summary">${options.summary
            .map((item) => {
                const tone = TONE_COLORS[item.tone ?? 'neutral'];
                return `
                    <div class="summary-card" style="background:${tone.bg};border-color:${tone.border};">
                        <p class="label" style="color:${tone.label};">${escapeHtml(item.label)}</p>
                        <p class="value" style="color:${tone.text};">${escapeHtml(item.value)}</p>
                    </div>
                `;
            })
            .join('')}</div>`
        : '';

    const sectionsHtml = options.sections
        .map((section) => {
            const headerHtml = `<h3 class="section-title">${escapeHtml(section.title)}</h3>`;
            if (section.infoRows && section.infoRows.length > 0) {
                const rowsHtml = section.infoRows
                    .map((row) => `
                        <div class="info-row">
                            <span class="info-label">${escapeHtml(row.label)}</span>
                            <span class="info-value">${escapeHtml(row.value || '—')}</span>
                        </div>
                    `)
                    .join('');
                return `<section class="section">${headerHtml}<div class="info-grid">${rowsHtml}</div></section>`;
            }
            if (section.table) {
                if (section.table.rows.length === 0) {
                    return `<section class="section">${headerHtml}<p class="empty-state">${escapeHtml(section.table.emptyText ?? '—')}</p></section>`;
                }
                const tableHtml = `
                    <table>
                        <thead><tr>${section.table.columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('')}</tr></thead>
                        <tbody>${section.table.rows
                            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
                            .join('')}</tbody>
                    </table>
                `;
                return `<section class="section">${headerHtml}${tableHtml}</section>`;
            }
            return '';
        })
        .join('');

    return patientCard + summaryHtml + sectionsHtml;
}

export function exportPatientReportToPdf(options: PatientReportOptions): void {
    if (typeof window === 'undefined') {
        return;
    }

    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const pageOrientation = options.orientation ?? 'portrait';
    const pageRule = `@page { margin: 14mm; size: A4 ${pageOrientation}; }`;

    const headerHtml = `
        <div class="brand-strip"></div>
        <div class="header">
            <div class="header-text">
                <h1>${escapeHtml(options.title)}</h1>
            </div>
            <div class="header-brand">
                <p class="brand">Identa</p>
                <p class="date">${escapeHtml(dateStr)}</p>
            </div>
        </div>
    `;
    const footerHtml = `
        <div class="footer">
            <span>Identa Dental Management</span>
            <span>${escapeHtml(dateStr)}</span>
        </div>
    `;
    const bodyHtml = headerHtml + buildPatientHtml(options) + footerHtml;
    const styles = PRINT_STYLES + PATIENT_REPORT_STYLES + pageRule;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(options.filename)}</title><style>${styles}</style></head><body>${bodyHtml}</body></html>`;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768');
    if (!printWindow) {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument;
        if (doc) {
            doc.open();
            doc.write(html);
            doc.close();
            iframe.onload = () => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => document.body.removeChild(iframe), 1000);
            };
        }
        return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    const trigger = () => { printWindow.focus(); printWindow.print(); };
    if (printWindow.document.readyState === 'complete') {
        setTimeout(trigger, 200);
    } else {
        printWindow.addEventListener('load', () => setTimeout(trigger, 200));
    }
}
