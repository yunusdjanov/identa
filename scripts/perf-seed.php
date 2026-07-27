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

/**
 * Usage:
 * php scripts/perf-seed.php [targetPatients=300] [extraAppointments=1200] [extraTreatments=250]
 */
$targetPatients = max(1, (int) ($argv[1] ?? 300));
$extraAppointments = max(0, (int) ($argv[2] ?? 1200));
$extraTreatments = max(0, (int) ($argv[3] ?? 250));

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
    'treatments' => Treatment::query()->where('dentist_id', $dentist->id)->count(),
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

for ($i = 0; $i < $extraTreatments; $i += 1) {
    $treatmentDate = Carbon::today()->subDays(random_int(0, 180));
    $cost = random_int(150_000, 2_500_000);
    $paid = random_int(0, $cost);

    Treatment::query()->create([
        'dentist_id' => $dentist->id,
        'created_by_user_id' => $dentist->id,
        'updated_by_user_id' => $dentist->id,
        'patient_id' => $focusPatientId,
        'teeth' => [random_int(1, 32)],
        'treatment_type' => 'Performance seed work',
        'description' => "Seeded treatment {$i}",
        'treatment_date' => $treatmentDate->toDateString(),
        'cost' => (string) $cost,
        'debt_amount' => (string) $cost,
        'paid_amount' => (string) $paid,
        'currency' => Treatment::CURRENCY_UZS,
        'notes' => 'Performance seed treatment entry',
    ]);
}

$afterCounts = [
    'patients' => Patient::query()->where('dentist_id', $dentist->id)->count(),
    'appointments' => Appointment::query()->where('dentist_id', $dentist->id)->count(),
    'treatments' => Treatment::query()->where('dentist_id', $dentist->id)->count(),
];

$elapsedMs = (int) round((microtime(true) - $startedAt) * 1000);

echo json_encode([
    'dentist_id' => $dentist->id,
    'target_patients' => $targetPatients,
    'extra_appointments' => $extraAppointments,
    'extra_treatments' => $extraTreatments,
    'before' => $beforeCounts,
    'after' => $afterCounts,
    'elapsed_ms' => $elapsedMs,
], JSON_PRETTY_PRINT) . PHP_EOL;

