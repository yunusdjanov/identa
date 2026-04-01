<?php

namespace Database\Seeders;

use App\Models\Appointment;
use App\Models\Invoice;
use App\Models\OdontogramEntry;
use App\Models\Patient;
use App\Models\PatientCategory;
use App\Models\Payment;
use App\Models\Treatment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    private const ADMIN_EMAIL = 'admin@odenta.test';
    private const DENTIST_EMAIL = 'dentist@odenta.test';
    private const ASSISTANT_ONE_EMAIL = 'assistant1@odenta.test';
    private const ASSISTANT_TWO_EMAIL = 'assistant2@odenta.test';
    private const DEMO_PASSWORD = 'password123';

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        DB::transaction(function (): void {
            $this->seedAdmin();
            $dentist = $this->seedDentist();

            $this->resetDemoDentistData($dentist);
            $this->seedAssistants($dentist);

            $categories = $this->seedPatientCategories($dentist);
            $patients = $this->seedPatients($dentist, 40);

            $this->attachCategoriesToPatients($patients, $categories);
            $this->seedAppointments($dentist, $patients);
            $this->seedOdontogramEntries($dentist, $patients);
            $this->seedTreatments($dentist, $patients);
            $this->seedInvoicesAndPayments($dentist, $patients);
        });
    }

    private function seedAdmin(): User
    {
        return User::query()->updateOrCreate(
            ['email' => self::ADMIN_EMAIL],
            [
                'name' => 'Platform Admin',
                'password' => self::DEMO_PASSWORD,
                'role' => User::ROLE_ADMIN,
                'account_status' => User::ACCOUNT_STATUS_ACTIVE,
                'dentist_owner_id' => null,
                'assistant_permissions' => null,
                'must_change_password' => false,
                'phone' => '+998 90 000 00 01',
                'practice_name' => null,
                'license_number' => null,
                'address' => null,
                'working_hours_start' => '09:00',
                'working_hours_end' => '18:00',
                'default_appointment_duration' => 30,
            ]
        );
    }

    private function seedDentist(): User
    {
        return User::query()->updateOrCreate(
            ['email' => self::DENTIST_EMAIL],
            [
                'name' => 'Dr Demo Dentist',
                'password' => self::DEMO_PASSWORD,
                'role' => User::ROLE_DENTIST,
                'account_status' => User::ACCOUNT_STATUS_ACTIVE,
                'dentist_owner_id' => null,
                'assistant_permissions' => null,
                'must_change_password' => false,
                'phone' => '+998 90 123 45 67',
                'practice_name' => 'Odenta Demo Studio',
                'license_number' => 'LIC-2026-DEMO',
                'address' => '1 Demo Street, Tashkent',
                'working_hours_start' => '09:00',
                'working_hours_end' => '18:00',
                'default_appointment_duration' => 30,
            ]
        );
    }

    private function resetDemoDentistData(User $dentist): void
    {
        User::query()
            ->where('role', User::ROLE_ASSISTANT)
            ->where('dentist_owner_id', $dentist->id)
            ->delete();

        PatientCategory::query()->where('dentist_id', $dentist->id)->delete();
        Patient::withTrashed()->where('dentist_id', $dentist->id)->forceDelete();

        Appointment::query()->where('dentist_id', $dentist->id)->delete();
        Invoice::query()->where('dentist_id', $dentist->id)->delete();
        Payment::query()->where('dentist_id', $dentist->id)->delete();
        OdontogramEntry::query()->where('dentist_id', $dentist->id)->delete();
        Treatment::query()->where('dentist_id', $dentist->id)->delete();
    }

    private function seedAssistants(User $dentist): void
    {
        $assistants = [
            [self::ASSISTANT_ONE_EMAIL, 'Assistant One', '+998 91 101 01 01'],
            [self::ASSISTANT_TWO_EMAIL, 'Assistant Two', '+998 91 202 02 02'],
        ];

        foreach ($assistants as [$email, $name, $phone]) {
            User::query()->updateOrCreate(
                ['email' => $email],
                [
                    'name' => $name,
                    'password' => self::DEMO_PASSWORD,
                    'role' => User::ROLE_ASSISTANT,
                    'dentist_owner_id' => $dentist->id,
                    'assistant_permissions' => User::defaultAssistantPermissions(),
                    'must_change_password' => false,
                    'account_status' => User::ACCOUNT_STATUS_ACTIVE,
                    'phone' => $phone,
                    'practice_name' => null,
                    'license_number' => null,
                    'address' => null,
                    'working_hours_start' => '09:00',
                    'working_hours_end' => '18:00',
                    'default_appointment_duration' => 30,
                ]
            );
        }
    }

    /**
     * @return Collection<int, PatientCategory>
     */
    private function seedPatientCategories(User $dentist): Collection
    {
        $definitions = [
            ['name' => 'VIP', 'color' => '#F97316'],
            ['name' => 'Family', 'color' => '#0EA5E9'],
            ['name' => 'Follow-up', 'color' => '#8B5CF6'],
            ['name' => 'Kids', 'color' => '#22C55E'],
            ['name' => 'Whitening', 'color' => '#06B6D4'],
            ['name' => 'Orthodontic', 'color' => '#EAB308'],
        ];

        $categories = collect();

        foreach ($definitions as $index => $definition) {
            $categories->push(PatientCategory::query()->create([
                'dentist_id' => $dentist->id,
                'name' => $definition['name'],
                'color' => $definition['color'],
                'sort_order' => $index,
            ]));
        }

        return $categories;
    }

    /**
     * @return Collection<int, Patient>
     */
    private function seedPatients(User $dentist, int $count): Collection
    {
        $patients = collect();

        for ($index = 0; $index < $count; $index++) {
            $birthDate = Carbon::now()->subYears(random_int(7, 75))->subDays(random_int(0, 364));
            $createdAt = Carbon::now()->subDays(random_int(0, 540))->setTime(random_int(8, 20), random_int(0, 59));

            $patients->push(Patient::query()->create([
                'dentist_id' => $dentist->id,
                'patient_id' => $this->generatePatientCode((int) $dentist->id),
                'full_name' => fake()->name(),
                'phone' => $this->randomUzPhone(),
                'secondary_phone' => random_int(1, 100) <= 35 ? $this->randomUzPhone() : null,
                'address' => fake()->streetAddress(),
                'date_of_birth' => $birthDate->toDateString(),
                'gender' => Arr::random(['male', 'female', null]),
                'medical_history' => random_int(1, 100) <= 60 ? fake()->sentence() : null,
                'allergies' => random_int(1, 100) <= 35 ? fake()->words(2, true) : null,
                'current_medications' => random_int(1, 100) <= 35 ? fake()->words(2, true) : null,
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]));
        }

        return $patients;
    }

    /**
     * @param Collection<int, Patient> $patients
     * @param Collection<int, PatientCategory> $categories
     */
    private function attachCategoriesToPatients(Collection $patients, Collection $categories): void
    {
        $categoryIds = $categories->pluck('id')->values();

        foreach ($patients as $patient) {
            if (random_int(1, 100) <= 28) {
                continue;
            }

            $count = random_int(1, 2);
            $selected = $categoryIds->shuffle()->take($count)->all();
            $patient->categories()->sync($selected);
        }
    }

    /**
     * @param Collection<int, Patient> $patients
     */
    private function seedAppointments(User $dentist, Collection $patients): void
    {
        $today = Carbon::today();
        $serviceReasons = [
            'General appointment',
            'Dental cleaning',
            'Filling check',
            'Root canal follow-up',
            'Consultation',
            'Pain complaint',
            'Whitening session',
        ];

        for ($offset = -14; $offset <= 21; $offset++) {
            $date = $today->copy()->addDays($offset);
            $dayOfWeek = (int) $date->dayOfWeekIso;
            $isWeekend = $dayOfWeek >= 6;

            $plannedCount = $isWeekend ? random_int(0, 3) : random_int(2, 7);
            if ($offset >= 0 && $offset <= 6) {
                $plannedCount += random_int(0, 3);
            }

            $cursor = $date->copy()->setTime(9, 0);

            for ($slot = 0; $slot < $plannedCount; $slot++) {
                $duration = Arr::random([30, 30, 30, 45, 60]);
                $end = $cursor->copy()->addMinutes($duration);

                if ($end->gt($date->copy()->setTime(19, 0))) {
                    break;
                }

                Appointment::query()->create([
                    'dentist_id' => $dentist->id,
                    'patient_id' => $patients->random()->id,
                    'appointment_date' => $date->toDateString(),
                    'start_time' => $cursor->format('H:i:s'),
                    'end_time' => $end->format('H:i:s'),
                    'status' => $this->resolveAppointmentStatus($date, $today),
                    'notes' => Arr::random($serviceReasons),
                ]);

                $cursor = $end->addMinutes(Arr::random([0, 0, 0, 15]));
            }
        }
    }

    private function resolveAppointmentStatus(Carbon $date, Carbon $today): string
    {
        if ($date->lt($today)) {
            return Arr::random([
                Appointment::STATUS_COMPLETED,
                Appointment::STATUS_COMPLETED,
                Appointment::STATUS_COMPLETED,
                Appointment::STATUS_SCHEDULED,
                Appointment::STATUS_CANCELLED,
                Appointment::STATUS_NO_SHOW,
            ]);
        }

        if ($date->isSameDay($today)) {
            return Arr::random([
                Appointment::STATUS_SCHEDULED,
                Appointment::STATUS_SCHEDULED,
                Appointment::STATUS_SCHEDULED,
                Appointment::STATUS_COMPLETED,
                Appointment::STATUS_CANCELLED,
                Appointment::STATUS_NO_SHOW,
            ]);
        }

        return Arr::random([
            Appointment::STATUS_SCHEDULED,
            Appointment::STATUS_SCHEDULED,
            Appointment::STATUS_SCHEDULED,
            Appointment::STATUS_SCHEDULED,
            Appointment::STATUS_CANCELLED,
            Appointment::STATUS_NO_SHOW,
        ]);
    }

    /**
     * @param Collection<int, Patient> $patients
     */
    private function seedOdontogramEntries(User $dentist, Collection $patients): void
    {
        $conditions = [
            OdontogramEntry::TYPE_CAVITY,
            OdontogramEntry::TYPE_FILLING,
            OdontogramEntry::TYPE_CROWN,
            OdontogramEntry::TYPE_ROOT_CANAL,
            OdontogramEntry::TYPE_EXTRACTION,
            OdontogramEntry::TYPE_IMPLANT,
        ];

        $materialByCondition = [
            OdontogramEntry::TYPE_FILLING => ['Composite', 'Amalgam', 'Glass ionomer'],
            OdontogramEntry::TYPE_CROWN => ['Ceramic', 'Zirconia', 'Metal-ceramic', 'Gold'],
            OdontogramEntry::TYPE_ROOT_CANAL => ['Gutta-percha'],
            OdontogramEntry::TYPE_IMPLANT => ['Titanium'],
        ];

        $pickedPatients = $patients->shuffle()->take(min(25, $patients->count()));

        foreach ($pickedPatients as $patient) {
            $entryCount = random_int(1, 4);
            $usedTeeth = [];

            for ($index = 0; $index < $entryCount; $index++) {
                $toothNumber = random_int(1, 32);
                if (in_array($toothNumber, $usedTeeth, true)) {
                    continue;
                }

                $usedTeeth[] = $toothNumber;
                $condition = Arr::random($conditions);
                $materials = $materialByCondition[$condition] ?? [];

                OdontogramEntry::query()->create([
                    'dentist_id' => $dentist->id,
                    'patient_id' => $patient->id,
                    'tooth_number' => $toothNumber,
                    'condition_type' => $condition,
                    'surface' => Arr::random(['occlusal', 'mesial', 'distal', 'buccal', 'lingual', null]),
                    'material' => $materials === [] ? null : Arr::random($materials),
                    'severity' => Arr::random(['mild', 'moderate', 'severe', null]),
                    'condition_date' => Carbon::now()->subDays(random_int(0, 300))->toDateString(),
                    'notes' => random_int(1, 100) <= 30 ? fake()->sentence() : null,
                ]);
            }
        }
    }

    /**
     * @param Collection<int, Patient> $patients
     */
    private function seedTreatments(User $dentist, Collection $patients): void
    {
        $workTypes = [
            'Consultation',
            'Dental cleaning',
            'Filling',
            'Root canal treatment',
            'Crown fitting',
            'Extraction',
            'Whitening',
            'Payment note',
        ];

        foreach ($patients as $patient) {
            $entriesCount = random_int(2, 6);

            for ($index = 0; $index < $entriesCount; $index++) {
                $teeth = collect(range(1, 32))
                    ->shuffle()
                    ->take(random_int(0, 3))
                    ->sort()
                    ->values()
                    ->all();

                $debt = random_int(0, 2_000_000);
                $allowOverpayment = random_int(1, 100) <= 12;

                if ($debt === 0) {
                    $paid = random_int(0, 600_000);
                } elseif ($allowOverpayment) {
                    $paid = random_int((int) floor($debt * 0.7), (int) floor($debt * 1.2));
                } else {
                    $paid = random_int(0, $debt);
                }

                Treatment::query()->create([
                    'dentist_id' => $dentist->id,
                    'patient_id' => $patient->id,
                    'tooth_number' => $teeth[0] ?? null,
                    'teeth' => $teeth === [] ? null : $teeth,
                    'treatment_type' => Arr::random($workTypes),
                    'description' => null,
                    'comment' => random_int(1, 100) <= 45 ? null : fake()->sentence(),
                    'treatment_date' => Carbon::now()->subDays(random_int(0, 300))->toDateString(),
                    'cost' => number_format((float) max($debt, $paid), 2, '.', ''),
                    'debt_amount' => number_format((float) $debt, 2, '.', ''),
                    'paid_amount' => number_format((float) $paid, 2, '.', ''),
                    'notes' => null,
                    'before_image_disk' => null,
                    'before_image_path' => null,
                    'after_image_disk' => null,
                    'after_image_path' => null,
                ]);
            }
        }
    }

    /**
     * @param Collection<int, Patient> $patients
     */
    private function seedInvoicesAndPayments(User $dentist, Collection $patients): void
    {
        $services = [
            ['name' => 'Consultation', 'min' => 100_000, 'max' => 250_000],
            ['name' => 'Dental cleaning', 'min' => 180_000, 'max' => 350_000],
            ['name' => 'Filling', 'min' => 250_000, 'max' => 600_000],
            ['name' => 'Root canal', 'min' => 700_000, 'max' => 1_700_000],
            ['name' => 'Crown', 'min' => 1_000_000, 'max' => 2_500_000],
            ['name' => 'X-ray', 'min' => 100_000, 'max' => 220_000],
        ];

        $invoiceSequenceByMonth = [];
        $invoicePatients = $patients->shuffle()->take((int) ceil($patients->count() * 0.75));

        foreach ($invoicePatients as $patient) {
            $invoiceCount = random_int(1, 3);

            for ($invoiceIndex = 0; $invoiceIndex < $invoiceCount; $invoiceIndex++) {
                $invoiceDate = Carbon::now()->subDays(random_int(0, 120))->startOfDay();
                $invoiceNumber = $this->nextInvoiceNumber($invoiceDate, $invoiceSequenceByMonth);
                $itemCount = random_int(1, 3);
                $items = [];
                $total = 0;

                for ($itemIndex = 0; $itemIndex < $itemCount; $itemIndex++) {
                    $service = Arr::random($services);
                    $quantity = random_int(1, 2);
                    $unitPrice = random_int($service['min'], $service['max']);
                    $lineTotal = $unitPrice * $quantity;
                    $total += $lineTotal;

                    $items[] = [
                        'description' => $service['name'],
                        'quantity' => $quantity,
                        'unit_price' => number_format((float) $unitPrice, 2, '.', ''),
                        'total_price' => number_format((float) $lineTotal, 2, '.', ''),
                        'sort_order' => $itemIndex,
                    ];
                }

                $status = Arr::random([
                    Invoice::STATUS_UNPAID,
                    Invoice::STATUS_PARTIALLY_PAID,
                    Invoice::STATUS_PARTIALLY_PAID,
                    Invoice::STATUS_PAID,
                ]);

                if ($status === Invoice::STATUS_UNPAID) {
                    $paid = 0;
                } elseif ($status === Invoice::STATUS_PAID) {
                    $paid = $total;
                } else {
                    $paid = random_int((int) floor($total * 0.2), (int) floor($total * 0.9));
                }

                $balance = max(0, $total - $paid);
                if ($balance === 0) {
                    $status = Invoice::STATUS_PAID;
                } elseif ($paid > 0) {
                    $status = Invoice::STATUS_PARTIALLY_PAID;
                } else {
                    $status = Invoice::STATUS_UNPAID;
                }

                $invoice = Invoice::query()->create([
                    'dentist_id' => $dentist->id,
                    'patient_id' => $patient->id,
                    'invoice_number' => $invoiceNumber,
                    'invoice_date' => $invoiceDate->toDateString(),
                    'due_date' => null,
                    'total_amount' => number_format((float) $total, 2, '.', ''),
                    'paid_amount' => number_format((float) $paid, 2, '.', ''),
                    'balance' => number_format((float) $balance, 2, '.', ''),
                    'status' => $status,
                    'notes' => null,
                ]);

                $invoice->items()->createMany($items);

                if ($paid <= 0) {
                    continue;
                }

                $paymentCount = random_int(1, 2);
                $remaining = $paid;

                for ($paymentIndex = 1; $paymentIndex <= $paymentCount; $paymentIndex++) {
                    if ($paymentIndex === $paymentCount) {
                        $amount = $remaining;
                    } else {
                        $minimumRemainingAfter = $paymentCount - $paymentIndex;
                        $maxCurrent = max(1, $remaining - $minimumRemainingAfter);
                        $amount = random_int(1, $maxCurrent);
                        $remaining -= $amount;
                    }

                    $paymentDate = $invoiceDate->copy()->addDays(random_int(0, 30));
                    if ($paymentDate->gt(Carbon::today())) {
                        $paymentDate = Carbon::today();
                    }

                    Payment::query()->create([
                        'dentist_id' => $dentist->id,
                        'patient_id' => $patient->id,
                        'invoice_id' => $invoice->id,
                        'amount' => number_format((float) $amount, 2, '.', ''),
                        'payment_method' => Arr::random([
                            Payment::METHOD_CASH,
                            Payment::METHOD_CARD,
                            Payment::METHOD_BANK_TRANSFER,
                        ]),
                        'payment_date' => $paymentDate->toDateString(),
                        'notes' => null,
                    ]);
                }
            }
        }
    }

    /**
     * @param array<string, int> $invoiceSequenceByMonth
     */
    private function nextInvoiceNumber(Carbon $invoiceDate, array &$invoiceSequenceByMonth): string
    {
        $month = $invoiceDate->format('ym');
        $invoiceSequenceByMonth[$month] = ($invoiceSequenceByMonth[$month] ?? 0) + 1;

        return sprintf('INV-%s-%04d', $month, $invoiceSequenceByMonth[$month]);
    }

    private function generatePatientCode(int $dentistId): string
    {
        do {
            $candidate = sprintf(
                'PT-%04d%s%s',
                random_int(1000, 9999),
                strtoupper(fake()->randomLetter()),
                strtoupper(fake()->randomLetter())
            );
        } while (
            Patient::withTrashed()
                ->where('dentist_id', $dentistId)
                ->where('patient_id', $candidate)
                ->exists()
        );

        return $candidate;
    }

    private function randomUzPhone(): string
    {
        $prefix = Arr::random([90, 91, 93, 94, 95, 97, 98, 99, 33, 77, 88]);

        return sprintf(
            '+998 %02d %03d %02d %02d',
            $prefix,
            random_int(100, 999),
            random_int(10, 99),
            random_int(10, 99)
        );
    }
}

