<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\InvoiceItem;
use Dompdf\Dompdf;
use Dompdf\Options;

class InvoicePdfService
{
    public function build(Invoice $invoice): string
    {
        $options = new Options;
        $options->set('defaultFont', 'DejaVu Sans');
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', false);
        $options->set('isPhpEnabled', false);
        $options->set('isFontSubsettingEnabled', true);

        $dompdf = new Dompdf($options);
        $html = view('pdf.invoice', $this->viewData($invoice))->render();

        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    /**
     * @return array<string, mixed>
     */
    public function viewData(Invoice $invoice): array
    {
        $providerName = trim((string) ($invoice->dentist?->practice_name ?: $invoice->dentist?->name ?: $this->tr('api.invoices_pdf.fallback_provider')));
        $providerContact = trim((string) ($invoice->dentist?->email ?: $invoice->dentist?->phone ?: ''));
        $patientName = trim((string) ($invoice->patient?->full_name ?? $this->tr('api.invoices_pdf.fallback_patient')));
        $patientCode = trim((string) ($invoice->patient?->patient_id ?? $this->tr('api.invoices_pdf.fallback_na')));
        $patientPhone = trim((string) ($invoice->patient?->phone ?? ''));

        $items = $invoice->items
            ->values()
            ->map(fn (InvoiceItem $item): array => [
                'description' => $item->description,
                'quantity' => (string) $item->quantity,
                'unit_price' => $this->formatMoney($item->unit_price),
                'total_price' => $this->formatMoney($item->total_price),
            ]);

        $payments = $invoice->payments
            ->sortByDesc('payment_date')
            ->values()
            ->map(fn ($payment): array => [
                'date' => $this->formatPdfDate($payment->payment_date),
                'method' => $this->translatePaymentMethod((string) $payment->payment_method),
                'amount' => $this->formatMoney($payment->amount),
            ]);

        return [
            'title' => $this->tr('api.invoices_pdf.title'),
            'invoice_number_line' => $this->tr('api.invoices_pdf.invoice_number', ['number' => $invoice->invoice_number]),
            'provider_label' => $this->tr('api.invoices_pdf.provider'),
            'patient_label' => $this->tr('api.invoices_pdf.patient'),
            'summary_label' => $this->tr('api.invoices_pdf.summary'),
            'invoice_date_label' => $this->tr('api.invoices_pdf.invoice_date', ['date' => $this->formatPdfDate($invoice->invoice_date)]),
            'status_label' => $this->tr('api.invoices_pdf.status', ['status' => $this->translateInvoiceStatus($invoice->status)]),
            'items_label' => $this->tr('api.invoices_pdf.items'),
            'payment_history_label' => $this->tr('api.invoices_pdf.payment_history'),
            'generated_by_label' => $this->tr('api.invoices_pdf.generated_by'),
            'headers' => [
                'description' => $this->tr('api.invoices_pdf.description'),
                'qty' => $this->tr('api.invoices_pdf.qty'),
                'unit' => $this->tr('api.invoices_pdf.unit'),
                'total' => $this->tr('api.invoices_pdf.total'),
                'date' => $this->tr('api.invoices_pdf.date'),
                'method' => $this->tr('api.invoices_pdf.method'),
                'amount' => $this->tr('api.invoices_pdf.amount'),
                'paid' => $this->tr('api.invoices_pdf.paid'),
                'balance' => $this->tr('api.invoices_pdf.balance'),
            ],
            'provider_name' => $providerName,
            'provider_contact' => $providerContact,
            'patient_name' => $patientName,
            'patient_line' => $this->tr('api.invoices_pdf.patient_line', [
                'id' => $patientCode,
                'phone' => $patientPhone,
                'phone_part' => $patientPhone !== '' ? " | {$patientPhone}" : '',
            ]),
            'items' => $items->all(),
            'payments' => $payments->all(),
            'no_payments_text' => $this->tr('api.invoices_pdf.no_payments'),
            'totals' => [
                'total' => $this->formatMoney($invoice->total_amount),
                'paid' => $this->formatMoney($invoice->paid_amount),
                'balance' => $this->formatMoney($invoice->balance),
            ],
            'generated_at' => now()->format('Y-m-d H:i'),
        ];
    }

    /**
     * @param  array<string, string>  $replace
     */
    private function tr(string $key, array $replace = []): string
    {
        $translated = __($key, $replace);

        return is_string($translated) ? $translated : $key;
    }

    private function formatPdfDate(mixed $value): string
    {
        if ($value === null) {
            return $this->tr('api.invoices_pdf.fallback_na');
        }

        $dateString = method_exists($value, 'toDateString') ? (string) $value->toDateString() : (string) $value;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateString) !== 1) {
            return $dateString !== '' ? $dateString : $this->tr('api.invoices_pdf.fallback_na');
        }

        $locale = app()->getLocale();
        if ($locale === 'ru' || $locale === 'uz') {
            [$year, $month, $day] = explode('-', $dateString);

            return "{$day}.{$month}.{$year}";
        }

        return $dateString;
    }

    private function translateInvoiceStatus(?string $status): string
    {
        $normalized = is_string($status) ? trim($status) : '';
        if ($normalized === '') {
            return $this->tr('api.invoices_pdf.fallback_na');
        }

        $key = "api.invoices_pdf.status_values.{$normalized}";
        $translated = $this->tr($key);

        return $translated === $key ? $this->humanizeValue($normalized) : $translated;
    }

    private function translatePaymentMethod(string $paymentMethod): string
    {
        $normalized = trim($paymentMethod);
        if ($normalized === '') {
            return $this->tr('api.invoices_pdf.fallback_na');
        }

        $key = "api.invoices_pdf.payment_methods.{$normalized}";
        $translated = $this->tr($key);

        return $translated === $key ? $this->humanizeValue($normalized) : $translated;
    }

    private function formatMoney(mixed $value): string
    {
        // ru/uz use space-thousands + comma-decimal (`1 234 567,89`); en uses
        // comma-thousands + dot-decimal (`1,234,567.89`). Match the frontend
        // F-M5 fix so the PDF reads the same as the tenant's screen.
        $locale = strtolower((string) app()->getLocale());
        $useEuropeanFormat = $locale === 'ru' || $locale === 'uz';
        $decimal = $useEuropeanFormat ? ',' : '.';
        $thousands = $useEuropeanFormat ? "\xC2\xA0" /* NBSP */ : ',';

        return number_format((float) $value, 2, $decimal, $thousands);
    }

    private function humanizeValue(string $value): string
    {
        return ucwords(str_replace('_', ' ', trim($value)));
    }
}
