<?php

declare(strict_types=1);

use App\Models\Appointment;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Patient;
use App\Models\User;
use Carbon\Carbon;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$dentist = User::query()
    ->where('role', User::ROLE_DENTIST)
    ->where('email', 'dentist@identa.test')
    ->first();

if (!$dentist) {
    $dentist = User::query()
        ->where('role', User::ROLE_DENTIST)
        ->first();
}

if (!$dentist) {
    throw new RuntimeException('No dentist account found for performance snapshot.');
}

$focusPatient = Patient::query()
    ->where('dentist_id', $dentist->id)
    ->withCount(['invoices', 'appointments'])
    ->orderByDesc('invoices_count')
    ->orderByDesc('appointments_count')
    ->first();

if (!$focusPatient) {
    throw new RuntimeException('No patients found for performance snapshot.');
}

/**
 * @template T
 * @param string $label
 * @param callable():T $callback
 * @return array{name:string,duration_ms:int,result:mixed}
 */
function benchmarkQuery(string $label, callable $callback): array
{
    $startedAt = microtime(true);
    $result = $callback();
    $durationMs = (int) round((microtime(true) - $startedAt) * 1000);

    return [
        'name' => $label,
        'duration_ms' => $durationMs,
        'result' => $result,
    ];
}

$today = Carbon::today();
$weekStart = $today->copy();
$weekEnd = $today->copy()->addDays(6);

$timings = [];

$timings[] = benchmarkQuery('appointments.day_view_slots', function () use ($dentist, $today): int {
    return Appointment::query()
        ->where('dentist_id', $dentist->id)
        ->whereDate('appointment_date', $today->toDateString())
        ->orderBy('start_time')
        ->get(['id', 'patient_id', 'appointment_date', 'start_time', 'end_time', 'status'])
        ->count();
});

$timings[] = benchmarkQuery('appointments.week_view_range', function () use ($dentist, $weekStart, $weekEnd): int {
    return Appointment::query()
        ->where('dentist_id', $dentist->id)
        ->whereBetween('appointment_date', [$weekStart->toDateString(), $weekEnd->toDateString()])
        ->orderBy('appointment_date')
        ->orderBy('start_time')
        ->get(['id', 'patient_id', 'appointment_date', 'start_time', 'end_time', 'status'])
        ->count();
});

$timings[] = benchmarkQuery('patient_detail.appointments_summary_total', function () use ($dentist, $focusPatient): int {
    return Appointment::query()
        ->where('dentist_id', $dentist->id)
        ->where('patient_id', $focusPatient->id)
        ->count();
});

$timings[] = benchmarkQuery('patient_detail.upcoming_appointments_top3', function () use ($dentist, $focusPatient, $today): int {
    return Appointment::query()
        ->where('dentist_id', $dentist->id)
        ->where('patient_id', $focusPatient->id)
        ->where('status', Appointment::STATUS_SCHEDULED)
        ->whereDate('appointment_date', '>=', $today->toDateString())
        ->orderBy('appointment_date')
        ->orderBy('start_time')
        ->limit(3)
        ->get(['id', 'appointment_date', 'start_time', 'end_time', 'status'])
        ->count();
});

$timings[] = benchmarkQuery('patient_detail.recent_invoices_top3', function () use ($dentist, $focusPatient): int {
    return Invoice::query()
        ->where('dentist_id', $dentist->id)
        ->where('patient_id', $focusPatient->id)
        ->orderByDesc('invoice_date')
        ->orderByDesc('created_at')
        ->limit(3)
        ->get(['id', 'invoice_number', 'invoice_date', 'total_amount', 'paid_amount', 'balance', 'status'])
        ->count();
});

$timings[] = benchmarkQuery('patient_detail.payment_summary_aggregate', function () use ($dentist, $focusPatient): float {
    return (float) Payment::query()
        ->where('dentist_id', $dentist->id)
        ->where('patient_id', $focusPatient->id)
        ->sum('amount');
});

$focusInvoice = Invoice::query()
    ->where('dentist_id', $dentist->id)
    ->where('patient_id', $focusPatient->id)
    ->orderByDesc('created_at')
    ->first();

if ($focusInvoice) {
    $timings[] = benchmarkQuery('patient_detail.invoice_payments_page1_20', function () use ($dentist, $focusPatient, $focusInvoice): int {
        return Payment::query()
            ->where('dentist_id', $dentist->id)
            ->where('patient_id', $focusPatient->id)
            ->where('invoice_id', $focusInvoice->id)
            ->orderByDesc('payment_date')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get(['id', 'amount', 'payment_method', 'payment_date', 'created_at'])
            ->count();
    });
}

$counts = [
    'patients' => Patient::query()->where('dentist_id', $dentist->id)->count(),
    'appointments' => Appointment::query()->where('dentist_id', $dentist->id)->count(),
    'invoices' => Invoice::query()->where('dentist_id', $dentist->id)->count(),
    'payments' => Payment::query()->where('dentist_id', $dentist->id)->count(),
];

$maxDurationMs = max(array_map(static fn (array $item): int => $item['duration_ms'], $timings));
$avgDurationMs = (int) round(array_sum(array_map(static fn (array $item): int => $item['duration_ms'], $timings)) / count($timings));

echo json_encode([
    'dentist_id' => $dentist->id,
    'focus_patient_id' => $focusPatient->id,
    'focus_invoice_id' => $focusInvoice?->id,
    'counts' => $counts,
    'timings' => $timings,
    'max_duration_ms' => $maxDurationMs,
    'avg_duration_ms' => $avgDurationMs,
], JSON_PRETTY_PRINT) . PHP_EOL;
