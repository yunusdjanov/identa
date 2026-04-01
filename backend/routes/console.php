<?php

use App\Support\ProductionSecretsValidator;
use App\Support\ProductionRuntimePolicyValidator;
use Illuminate\Support\Facades\DB;
use App\Models\Invoice;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('security:check-secrets', function () {
    /** @var ProductionSecretsValidator $secretValidator */
    $secretValidator = app(ProductionSecretsValidator::class);

    $issues = $secretValidator->findProductionIssues();

    if ($issues === []) {
        $this->info('Secrets check passed: required production secrets look valid.');

        return 0;
    }

    $this->error('Secrets check failed:');
    foreach ($issues as $issue) {
        $this->line("- {$issue}");
    }

    return 1;
})->purpose('Validate required production secret configuration and fail on insecure placeholders');

Artisan::command('security:check-runtime {--production : Force production-policy checks even outside APP_ENV=production}', function () {
    $checkForProduction = (bool) $this->option('production') || app()->environment('production');

    if (!$checkForProduction) {
        $this->warn('Runtime security policy check skipped (not in production). Use --production to force.');

        return 0;
    }

    /** @var ProductionRuntimePolicyValidator $runtimePolicyValidator */
    $runtimePolicyValidator = app(ProductionRuntimePolicyValidator::class);
    $issues = $runtimePolicyValidator->findProductionIssues();

    if ($issues === []) {
        $this->info('Runtime security policy check passed for production.');

        return 0;
    }

    $this->error('Runtime security policy check failed:');
    foreach ($issues as $issue) {
        $this->line("- {$issue}");
    }

    return 1;
})->purpose('Validate edge/TLS runtime policy requirements for production');

Artisan::command('invoices:normalize-numbers {--commit : Persist changes (default is dry-run)} {--dentist_id= : Normalize invoices only for one dentist id}', function () {
    $dentistIdFilter = $this->option('dentist_id');
    $commit = (bool) $this->option('commit');

    $query = Invoice::query()
        ->select(['id', 'dentist_id', 'invoice_number', 'invoice_date', 'created_at'])
        ->orderBy('dentist_id')
        ->orderBy('invoice_date')
        ->orderBy('created_at')
        ->orderBy('id');

    if (is_string($dentistIdFilter) && trim($dentistIdFilter) !== '') {
        $trimmedDentistId = trim($dentistIdFilter);
        if (!ctype_digit($trimmedDentistId)) {
            $this->error('The --dentist_id option must be a numeric user id.');

            return 1;
        }

        $query->where('dentist_id', (int) $trimmedDentistId);
    }

    /** @var \Illuminate\Support\Collection<int, Invoice> $invoices */
    $invoices = $query->get();
    if ($invoices->isEmpty()) {
        $this->info('No invoices found for normalization.');

        return 0;
    }

    $sequenceByScope = [];
    $updates = [];

    foreach ($invoices as $invoice) {
        $month = $invoice->invoice_date?->format('ym') ?? $invoice->created_at?->format('ym') ?? now()->format('ym');
        $scopeKey = "{$invoice->dentist_id}|{$month}";

        $nextSequence = ($sequenceByScope[$scopeKey] ?? 0) + 1;
        if ($nextSequence > 9999) {
            $this->error("Monthly sequence overflow for dentist {$invoice->dentist_id}, month {$month}.");

            return 1;
        }

        $sequenceByScope[$scopeKey] = $nextSequence;
        $normalizedNumber = 'INV-'.$month.'-'.str_pad((string) $nextSequence, 4, '0', STR_PAD_LEFT);

        if ($invoice->invoice_number === $normalizedNumber) {
            continue;
        }

        $updates[] = [
            'id' => $invoice->id,
            'dentist_id' => (string) $invoice->dentist_id,
            'from' => (string) $invoice->invoice_number,
            'to' => $normalizedNumber,
        ];
    }

    $totalInvoices = $invoices->count();
    $totalChanges = count($updates);
    $modeLabel = $commit ? 'COMMIT' : 'DRY-RUN';
    $this->info("Invoice normalization mode: {$modeLabel}");
    $this->line("Scanned invoices: {$totalInvoices}");
    $this->line("Planned changes: {$totalChanges}");

    if ($totalChanges === 0) {
        $this->info('All invoice numbers are already normalized.');

        return 0;
    }

    $previewRows = array_slice($updates, 0, 25);
    $this->table(['id', 'dentist_id', 'from', 'to'], $previewRows);
    if ($totalChanges > count($previewRows)) {
        $remaining = $totalChanges - count($previewRows);
        $this->line("... plus {$remaining} more change(s).");
    }

    if (!$commit) {
        $this->comment('Dry-run only. Re-run with --commit to apply changes.');

        return 0;
    }

    DB::transaction(function () use ($updates): void {
        foreach ($updates as $update) {
            Invoice::query()
                ->where('id', $update['id'])
                ->update(['invoice_number' => $update['to']]);
        }
    });

    $duplicateCount = Invoice::query()
        ->select('dentist_id', 'invoice_number', DB::raw('COUNT(*) as aggregate_count'))
        ->groupBy('dentist_id', 'invoice_number')
        ->having('aggregate_count', '>', 1)
        ->get()
        ->count();

    if ($duplicateCount > 0) {
        $this->error('Normalization completed with duplicate invoice numbers detected.');

        return 1;
    }

    $this->info('Invoice numbers normalized successfully.');

    return 0;
})->purpose('Normalize historical invoice numbers to INV-YYMM-#### format');
