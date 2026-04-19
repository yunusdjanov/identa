<?php

declare(strict_types=1);

use App\Models\Appointment;
use App\Models\Invoice;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\User;
use Carbon\Carbon;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

/**
 * Usage:
 * php scripts/perf-seed.php [targetPatients=300] [extraAppointments=1200] [extraInvoices=250]
 */
$targetPatients = max(1, (int) ($argv[1] ?? 300));
$extraAppointments = max(0, (int) ($argv[2] ?? 1200));
$extraInvoices = max(0, (int) ($argv[3] ?? 250));

$startedAt = microtime(true);

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
    $dentist = User::factory()->create([
        'name' => 'Perf Dentist',
        'email' => 'dentist@identa.test',
        'password' => 'password123',
    ]);
}

$beforeCounts = [
    'patients' => Patient::query()->where('dentist_id', $dentist->id)->count(),
    'appointments' => Appointment::query()->where('dentist_id', $dentist->id)->count(),
    'invoices' => Invoice::query()->where('dentist_id', $dentist->id)->count(),
    'payments' => Payment::query()->where('dentist_id', $dentist->id)->count(),
];

$missingPatients = max(0, $targetPatients - $beforeCounts['patients']);
if ($missingPatients > 0) {
    Patient::factory()->count($missingPatients)->create([
        'dentist_id' => $dentist->id,
    ]);
}

$patientIds = Patient::query()
    ->where('dentist_id', $dentist->id)
    ->pluck('id')
    ->values()
    ->all();

if (count($patientIds) === 0) {
    throw new RuntimeException('No patients available for performance seeding.');
}

if ($extraAppointments > 0) {
    Appointment::factory()
        ->count($extraAppointments)
        ->state(function () use ($dentist, $patientIds): array {
            $baseDate = Carbon::today()->addDays(random_int(-30, 30));
            $hour = random_int(7, 21);
            $minute = random_int(0, 1) === 0 ? 0 : 30;
            $startAt = $baseDate->copy()->setTime($hour, $minute);
            $endAt = $startAt->copy()->addMinutes(30);

            return [
                'dentist_id' => $dentist->id,
                'patient_id' => $patientIds[array_rand($patientIds)],
                'appointment_date' => $startAt->toDateString(),
                'start_time' => $startAt->format('H:i'),
                'end_time' => $endAt->format('H:i'),
            ];
        })
        ->create();
}

$focusPatientId = $patientIds[0];

for ($i = 0; $i < $extraInvoices; $i += 1) {
    $invoiceDate = Carbon::today()->subDays(random_int(0, 180));
    $totalAmount = (string) random_int(150_000, 2_500_000);
    $total = (float) $totalAmount;
    $paid = (float) random_int(0, (int) $total);
    $balance = max(0, $total - $paid);
    $status = Invoice::STATUS_UNPAID;

    if ($paid > 0 && $balance > 0) {
        $status = Invoice::STATUS_PARTIALLY_PAID;
    } elseif ($balance <= 0) {
        $status = Invoice::STATUS_PAID;
    }

    $invoice = Invoice::query()->create([
        'dentist_id' => $dentist->id,
        'patient_id' => $focusPatientId,
        'invoice_number' => sprintf('INV-PF-%s-%04d', now()->format('YmdHis'), $i),
        'invoice_date' => $invoiceDate->toDateString(),
        'due_date' => $invoiceDate->copy()->addDays(10)->toDateString(),
        'total_amount' => $totalAmount,
        'paid_amount' => (string) $paid,
        'balance' => (string) $balance,
        'status' => $status,
        'notes' => 'Performance seed invoice',
    ]);

    $invoice->items()->create([
        'description' => 'Seeded treatment',
        'quantity' => 1,
        'unit_price' => $totalAmount,
        'total_price' => $totalAmount,
        'sort_order' => 0,
    ]);

    if ($paid > 0) {
        $remaining = $paid;
        $parts = min(3, max(1, random_int(1, 3)));

        for ($part = 1; $part <= $parts; $part += 1) {
            $isLastPart = $part === $parts;
            $amount = $isLastPart
                ? $remaining
                : round($remaining * (random_int(25, 60) / 100), 2);

            $remaining -= $amount;
            $remaining = max(0, $remaining);

            Payment::query()->create([
                'dentist_id' => $dentist->id,
                'patient_id' => $focusPatientId,
                'invoice_id' => $invoice->id,
                'amount' => (string) $amount,
                'payment_method' => [Payment::METHOD_CASH, Payment::METHOD_CARD, Payment::METHOD_BANK_TRANSFER][array_rand([0, 1, 2])],
                'payment_date' => $invoiceDate->copy()->addDays(random_int(0, 20))->toDateString(),
                'notes' => 'Performance seed payment',
            ]);
        }
    }
}

$afterCounts = [
    'patients' => Patient::query()->where('dentist_id', $dentist->id)->count(),
    'appointments' => Appointment::query()->where('dentist_id', $dentist->id)->count(),
    'invoices' => Invoice::query()->where('dentist_id', $dentist->id)->count(),
    'payments' => Payment::query()->where('dentist_id', $dentist->id)->count(),
];

$elapsedMs = (int) round((microtime(true) - $startedAt) * 1000);

echo json_encode([
    'dentist_id' => $dentist->id,
    'target_patients' => $targetPatients,
    'extra_appointments' => $extraAppointments,
    'extra_invoices' => $extraInvoices,
    'before' => $beforeCounts,
    'after' => $afterCounts,
    'elapsed_ms' => $elapsedMs,
], JSON_PRETTY_PRINT) . PHP_EOL;

