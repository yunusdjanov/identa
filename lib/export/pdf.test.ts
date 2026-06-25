import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportPatientReportToPdf, exportRowsToPdf } from '@/lib/export/pdf';

function createPrintWindowMock() {
    let writtenHtml = '';
    const printWindow = {
        document: {
            readyState: 'complete',
            open: vi.fn(),
            write: vi.fn((html: string) => {
                writtenHtml += html;
            }),
            close: vi.fn(),
        },
        focus: vi.fn(),
        print: vi.fn(),
        addEventListener: vi.fn(),
    };

    return {
        printWindow: printWindow as unknown as Window,
        getWrittenHtml: () => writtenHtml,
    };
}

describe('PDF export print templates', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('uses zero page margin for table exports so browser URL footers are not printed', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-25T12:00:00Z'));
        const { printWindow, getWrittenHtml } = createPrintWindowMock();
        vi.spyOn(window, 'open').mockReturnValue(printWindow);

        exportRowsToPdf({
            filename: 'payments',
            title: 'Payments',
            locale: 'uz',
            columns: ['Patient'],
            rows: [['Jane Doe']],
        });

        const html = getWrittenHtml();
        expect(html).toContain('@page { margin: 0; size: A4 landscape; }');
        expect(html).toContain('--pdf-print-padding-y: 16mm');
        expect(html).not.toContain('@page { margin: 16mm');
        expect(html).toContain('25 iyn 2026');

        vi.runOnlyPendingTimers();
        expect(printWindow.print).toHaveBeenCalledTimes(1);
    });

    it('uses zero page margin for patient reports while preserving report padding', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-25T12:00:00Z'));
        const { printWindow, getWrittenHtml } = createPrintWindowMock();
        vi.spyOn(window, 'open').mockReturnValue(printWindow);

        exportPatientReportToPdf({
            filename: 'patient-history',
            title: 'Patient History',
            locale: 'uz',
            patientName: 'Jane Doe',
            patientMeta: ['2 visits'],
            sections: [
                {
                    title: 'History',
                    table: {
                        columns: ['Date'],
                        rows: [['Jun 15, 2026']],
                    },
                },
            ],
        });

        const html = getWrittenHtml();
        expect(html).toContain('@page { margin: 0; size: A4 portrait; }');
        expect(html).toContain('--pdf-print-padding-y: 14mm');
        expect(html).not.toContain('@page { margin: 14mm');
        expect(html).toContain('25 iyn 2026');

        vi.runOnlyPendingTimers();
        expect(printWindow.print).toHaveBeenCalledTimes(1);
    });
});
