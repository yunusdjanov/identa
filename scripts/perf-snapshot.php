<?php

declare(strict_types=1);

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\Treatment;
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
    ->withCount(['treatments', 'appointments'])
    ->orderByDesc('treatments_count')
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

$timings[] = benchmarkQuery('patient_detail.recent_treatments_page1_20', function () use ($dentist, $focusPatient): int {
    return Treatment::query()
        ->where('dentist_id', $dentist->id)
        ->where('patient_id', $focusPatient->id)
        ->orderByDesc('treatment_date')
        ->orderByDesc('created_at')
        ->limit(20)
        ->get(['id', 'treatment_type', 'treatment_date', 'cost', 'debt_amount', 'paid_amount', 'currency'])
        ->count();
});

$timings[] = benchmarkQuery('patient_detail.payment_summary_aggregate', function () use ($dentist, $focusPatient): float {
    return (float) Treatment::query()
        ->where('dentist_id', $dentist->id)
        ->where('patient_id', $focusPatient->id)
        ->sum('paid_amount');
});

$focusTreatment = Treatment::query()
    ->where('dentist_id', $dentist->id)
    ->where('patient_id', $focusPatient->id)
    ->orderByDesc('created_at')
    ->first();

if ($focusTreatment) {
    $timings[] = benchmarkQuery('payments.patient_ledger_page1_20', function () use ($dentist, $focusPatient): int {
        return Treatment::query()
            ->where('dentist_id', $dentist->id)
            ->where('patient_id', $focusPatient->id)
            ->orderByDesc('treatment_date')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get(['id', 'treatment_type', 'treatment_date', 'debt_amount', 'paid_amount', 'currency'])
            ->count();
    });
}

$counts = [
    'patients' => Patient::query()->where('dentist_id', $dentist->id)->count(),
    'appointments' => Appointment::query()->where('dentist_id', $dentist->id)->count(),
    'treatments' => Treatment::query()->where('dentist_id', $dentist->id)->count(),
];

$maxDurationMs = max(array_map(static fn (array $item): int => $item['duration_ms'], $timings));
$avgDurationMs = (int) round(array_sum(array_map(static fn (array $item): int => $item['duration_ms'], $timings)) / count($timings));

echo json_encode([
    'dentist_id' => $dentist->id,
    'focus_patient_id' => $focusPatient->id,
    'focus_treatment_id' => $focusTreatment?->id,
    'counts' => $counts,
    'timings' => $timings,
    'max_duration_ms' => $maxDurationMs,
    'avg_duration_ms' => $avgDurationMs,
], JSON_PRETTY_PRINT) . PHP_EOL;
