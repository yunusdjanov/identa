<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PatientIdentityService
{
    private const MAX_CODE_GENERATION_ATTEMPTS = 100;

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(int $dentistId, array $attributes): Patient
    {
        // Serialize the two patient-creation paths per tenant. This closes the
        // check-then-insert race without trying to recover a PostgreSQL
        // transaction after a unique-constraint violation.
        $this->lockTenant($dentistId);

        for ($attempt = 1; $attempt <= self::MAX_CODE_GENERATION_ATTEMPTS; $attempt++) {
            $patientCode = $this->generateCode();
            $exists = Patient::query()
                ->where('dentist_id', $dentistId)
                ->where('patient_id', $patientCode)
                ->exists();

            if (! $exists) {
                return Patient::create([
                    ...$attributes,
                    'dentist_id' => $dentistId,
                    'patient_id' => $patientCode,
                ]);
            }
        }

        throw new \RuntimeException('Unable to allocate a unique patient code.');
    }

    /**
     * Lock the tenant identity namespace before any narrower row locks.
     * Keeping this order consistent prevents cross-flow deadlocks when a
     * guest appointment is promoted into a patient card.
     */
    public function lockTenant(int $dentistId): void
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Patient identity creation requires an active database transaction.');
        }

        User::query()
            ->whereKey($dentistId)
            ->lockForUpdate()
            ->firstOrFail(['id']);
    }

    private function generateCode(): string
    {
        $numericPart = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $suffix = chr(random_int(65, 90)).chr(random_int(65, 90));

        return "PT-{$numericPart}{$suffix}";
    }
}
