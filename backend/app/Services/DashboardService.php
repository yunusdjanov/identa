<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Treatment;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class DashboardService
{
    /**
     * @return array<string, mixed>
     */
    public function snapshot(User $user, string $targetDate): array
    {
        $tenantDentistId = $user->tenantDentistId();
        abort_unless($tenantDentistId !== null, 403);

        $includeAppointments = $user->hasPermission(User::PERMISSION_APPOINTMENTS_VIEW);
        $includeFinancials = $user->hasPermission(User::PERMISSION_PAYMENTS_VIEW);
        $cacheKey = sprintf(
            'dashboard:snapshot:%s:%s:%s:%s',
            $tenantDentistId,
            $targetDate,
            $includeAppointments ? 'appointments' : 'no-appointments',
            $includeFinancials ? 'finance' : 'standard'
        );

        return Cache::remember(
            $cacheKey,
            now()->addSeconds(30),
            fn (): array => $this->buildSnapshot($tenantDentistId, $includeAppointments, $includeFinancials, $targetDate)
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function buildSnapshot(
        int $tenantDentistId,
        bool $includeAppointments,
        bool $includeFinancials,
        string $targetDate
    ): array {
        $todayAppointments = [];

        if ($includeAppointments) {
            $todayAppointments = Appointment::query()
                ->where('dentist_id', $tenantDentistId)
                ->whereDate('appointment_date', $targetDate)
                ->with(['patient:id,full_name'])
                ->orderBy('start_time')
                ->get([
                    'id',
                    'patient_id',
                    'appointment_date',
                    'start_time',
                    'end_time',
                    'status',
                    'notes',
                ])
                ->map(fn (Appointment $appointment): array => [
                    'id' => (string) $appointment->id,
                    'patientName' => $appointment->patient?->full_name ?? 'Unknown patient',
                    'appointmentDate' => $appointment->appointment_date?->format('Y-m-d'),
                    'startTime' => (string) $appointment->start_time,
                    'durationMinutes' => $this->durationMinutes(
                        (string) $appointment->start_time,
                        (string) $appointment->end_time
                    ),
                    'status' => (string) $appointment->status,
                    'reason' => $appointment->notes !== null && $appointment->notes !== ''
                        ? (string) $appointment->notes
                        : null,
                ])
                ->values()
                ->all();
        }

        $revenueThisMonth = 0.0;
        $outstandingDebtTotal = 0.0;

        if ($includeFinancials) {
            $revenueThisMonth = (float) Treatment::query()
                ->where('dentist_id', $tenantDentistId)
                ->whereBetween('treatment_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
                ->sum('paid_amount');

            $patientBalances = Treatment::query()
                ->where('dentist_id', $tenantDentistId)
                ->selectRaw('patient_id, COALESCE(SUM(debt_amount), 0) AS total_debt, COALESCE(SUM(paid_amount), 0) AS total_paid')
                ->groupBy('patient_id');

            $outstandingDebtTotal = (float) DB::query()
                ->fromSub($patientBalances->toBase(), 'patient_balances')
                ->selectRaw('COALESCE(SUM(CASE WHEN total_debt - total_paid > 0 THEN total_debt - total_paid ELSE 0 END), 0) AS total')
                ->value('total');
        }

        return [
            'revenueThisMonth' => $revenueThisMonth,
            'outstandingDebtTotal' => $outstandingDebtTotal,
            'todayAppointments' => $todayAppointments,
        ];
    }

    private function durationMinutes(string $startTime, string $endTime): int
    {
        [$startHour, $startMinute] = array_map('intval', explode(':', $startTime));
        [$endHour, $endMinute] = array_map('intval', explode(':', $endTime));

        return max(0, ($endHour * 60 + $endMinute) - ($startHour * 60 + $startMinute));
    }
}
