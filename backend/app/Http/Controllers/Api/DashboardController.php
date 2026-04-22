<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Treatment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class DashboardController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $tenantDentistId = $user->tenantDentistId();

        abort_unless($tenantDentistId !== null, 403);

        $includeFinancials = $user->isDentist();
        $cacheKey = sprintf(
            'dashboard:snapshot:%s:%s',
            $tenantDentistId,
            $includeFinancials ? 'finance' : 'standard'
        );

        $data = Cache::remember($cacheKey, now()->addSeconds(10), function () use ($tenantDentistId, $includeFinancials): array {
            $todayAppointments = Appointment::query()
                ->where('dentist_id', $tenantDentistId)
                ->whereDate('appointment_date', today())
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
                ->map(function (Appointment $appointment): array {
                    return [
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
                    ];
                })
                ->values()
                ->all();

            $revenueThisMonth = 0.0;
            $outstandingDebtTotal = 0.0;

            if ($includeFinancials) {
                $revenueThisMonth = (float) Treatment::query()
                    ->where('dentist_id', $tenantDentistId)
                    ->whereBetween('treatment_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
                    ->sum('paid_amount');

                $outstandingDebtTotal = (float) Treatment::query()
                    ->where('dentist_id', $tenantDentistId)
                    ->selectRaw('patient_id, COALESCE(SUM(debt_amount), 0) AS total_debt, COALESCE(SUM(paid_amount), 0) AS total_paid')
                    ->groupBy('patient_id')
                    ->get()
                    ->sum(function (Treatment $treatment): float {
                        $balance = (float) $treatment->getAttribute('total_debt') - (float) $treatment->getAttribute('total_paid');

                        return max($balance, 0.0);
                    });
            }

            return [
                'revenueThisMonth' => $revenueThisMonth,
                'outstandingDebtTotal' => $outstandingDebtTotal,
                'todayAppointments' => $todayAppointments,
            ];
        });

        return response()->json([
            'data' => $data,
        ]);
    }

    private function durationMinutes(string $startTime, string $endTime): int
    {
        [$startHour, $startMinute] = array_map('intval', explode(':', $startTime));
        [$endHour, $endMinute] = array_map('intval', explode(':', $endTime));

        return max(0, ($endHour * 60 + $endMinute) - ($startHour * 60 + $startMinute));
    }
}
