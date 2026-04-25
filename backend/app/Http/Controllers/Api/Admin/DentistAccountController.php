<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ManageDentistSubscriptionRequest;
use App\Http\Requests\Admin\ResetDentistPasswordRequest;
use App\Http\Requests\Admin\StoreDentistRequest;
use App\Http\Requests\Admin\UpdateDentistStatusRequest;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class DentistAccountController extends Controller
{
    private const DEFAULT_PER_PAGE = 15;
    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $search = $request->input('filter.search');
        $status = $request->input('filter.status');
        $summaryQuery = User::query()->where('role', User::ROLE_DENTIST);

        $query = User::query()
            ->where('role', User::ROLE_DENTIST)
            ->withCount([
                'patients',
                'appointments',
                'assistants as active_assistants_count' => fn (Builder $builder) => $builder
                    ->where('account_status', User::ACCOUNT_STATUS_ACTIVE),
            ])
            ->orderByDesc('created_at');

        if (is_string($search) && $search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('practice_name', 'like', "%{$search}%");
            });
        }

        if (is_string($status) && $status !== '') {
            $query->where('account_status', $status);
        }

        $dentists = $query->paginate($this->resolvePerPage($request));
        $totalCount = (clone $summaryQuery)->count();
        $activeCount = (clone $summaryQuery)
            ->where('account_status', User::ACCOUNT_STATUS_ACTIVE)
            ->count();
        $newRegistrations7d = (clone $summaryQuery)
            ->whereDate('created_at', '>=', now()->subDays(6)->startOfDay()->toDateString())
            ->count();

        return response()->json([
            'data' => collect($dentists->items())
                ->map(fn (User $dentist): array => $this->transformDentist($dentist))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $dentists->currentPage(),
                    'per_page' => $dentists->perPage(),
                    'total' => $dentists->total(),
                    'total_pages' => $dentists->lastPage(),
                ],
                'summary' => [
                    'total_count' => $totalCount,
                    'active_count' => $activeCount,
                    'new_registrations_7d' => $newRegistrations7d,
                ],
            ],
        ]);
    }

    public function store(StoreDentistRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $dentist = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'phone' => $validated['phone'] ?? null,
            'practice_name' => $validated['practice_name'] ?? null,
            'license_number' => $validated['license_number'] ?? null,
            'address' => $validated['address'] ?? null,
            'working_hours_start' => '09:00',
            'working_hours_end' => '20:00',
            'default_appointment_duration' => 30,
            'role' => User::ROLE_DENTIST,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);
        $dentist->startFreeTrial();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.dentist.created',
            entityType: 'user',
            entityId: (string) $dentist->id,
            metadata: [
                'email' => $dentist->email,
                'subscription_plan' => $dentist->subscription_plan,
            ],
        );

        return response()->json([
            'data' => $this->transformDentist($dentist->fresh()->loadCount(['patients', 'appointments'])),
        ], 201);
    }

    public function manageSubscription(ManageDentistSubscriptionRequest $request, string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, false);
        $validated = $request->validated();
        $action = (string) $validated['action'];
        $paymentMethod = $validated['payment_method'] ?? null;
        $paymentAmount = array_key_exists('payment_amount', $validated)
            ? (float) $validated['payment_amount']
            : null;
        $note = isset($validated['note']) ? trim((string) $validated['note']) : null;

        match ($action) {
            'apply_monthly' => $dentist->applyPaidSubscription(
                User::SUBSCRIPTION_PLAN_MONTHLY,
                $paymentMethod,
                $paymentAmount,
                $note,
            ),
            'apply_yearly' => $dentist->applyPaidSubscription(
                User::SUBSCRIPTION_PLAN_YEARLY,
                $paymentMethod,
                $paymentAmount,
                $note,
            ),
            'activate_monthly' => $dentist->activatePaidSubscription(
                User::SUBSCRIPTION_PLAN_MONTHLY,
                $paymentMethod,
                $paymentAmount,
                $note,
            ),
            'activate_yearly' => $dentist->activatePaidSubscription(
                User::SUBSCRIPTION_PLAN_YEARLY,
                $paymentMethod,
                $paymentAmount,
                $note,
            ),
            'extend_monthly' => $dentist->extendPaidSubscription(
                User::SUBSCRIPTION_PLAN_MONTHLY,
                $paymentMethod,
                $paymentAmount,
                $note,
            ),
            'extend_yearly' => $dentist->extendPaidSubscription(
                User::SUBSCRIPTION_PLAN_YEARLY,
                $paymentMethod,
                $paymentAmount,
                $note,
            ),
            'cancel_at_period_end' => $dentist->cancelSubscriptionAtPeriodEnd($note),
            'cancel_now' => $dentist->cancelSubscriptionImmediately($note),
        };

        $dentist = $dentist->fresh()->loadCount([
            'patients',
            'appointments',
            'assistants as active_assistants_count' => fn (Builder $builder) => $builder
                ->where('account_status', User::ACCOUNT_STATUS_ACTIVE),
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.dentist.subscription_updated',
            entityType: 'user',
            entityId: (string) $dentist->id,
            metadata: [
                'action' => $action,
                'plan' => $dentist->subscription_plan,
                'status' => $dentist->subscriptionStatus(),
                'payment_method' => $paymentMethod,
                'payment_amount' => $paymentAmount,
            ],
        );

        return response()->json([
            'data' => $this->transformDentist($dentist),
        ]);
    }

    public function updateStatus(UpdateDentistStatusRequest $request, string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, true);
        $status = $request->validated('status');

        if ($dentist->account_status === User::ACCOUNT_STATUS_DELETED) {
            throw ValidationException::withMessages([
                'status' => [__('api.admin.cannot_update_deleted_account_status')],
            ]);
        }

        $dentist->update([
            'account_status' => $status,
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.dentist.status_updated',
            entityType: 'user',
            entityId: (string) $dentist->id,
            metadata: [
                'status' => $status,
            ],
        );

        return response()->json([
            'data' => $this->transformDentist($dentist->fresh()->loadCount(['patients', 'appointments'])),
        ]);
    }

    public function resetPassword(ResetDentistPasswordRequest $request, string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, false);
        $newPassword = (string) $request->validated('new_password');

        $dentist->update([
            'password' => Hash::make($newPassword),
            'remember_token' => null,
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.dentist.password_reset',
            entityType: 'user',
            entityId: (string) $dentist->id,
        );

        return response()->json([
            'data' => [
                'dentist_id' => (string) $dentist->id,
                'password_reset' => true,
            ],
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, true);

        if ($dentist->account_status === User::ACCOUNT_STATUS_DELETED) {
            return response()->json([], 204);
        }

        $dentist->update([
            'account_status' => User::ACCOUNT_STATUS_DELETED,
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.dentist.deleted',
            entityType: 'user',
            entityId: (string) $dentist->id,
        );

        return response()->json([], 204);
    }

    private function resolvePerPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function findDentist(string $id, bool $allowDeleted): User
    {
        $query = User::query()
            ->where('id', $id)
            ->where('role', User::ROLE_DENTIST);

        if (! $allowDeleted) {
            $query->where('account_status', '!=', User::ACCOUNT_STATUS_DELETED);
        }

        return $query->firstOrFail();
    }

    /**
     * @return array<string, mixed>
     */
    private function transformDentist(User $dentist): array
    {
        return [
            'id' => (string) $dentist->id,
            'name' => $dentist->name,
            'email' => $dentist->email,
            'practice_name' => $dentist->practice_name,
            'registration_date' => $dentist->created_at?->toDateString(),
            'status' => $dentist->account_status,
            'last_login' => $dentist->last_login_at?->toIso8601String(),
            'patient_count' => $dentist->patients_count ?? 0,
            'appointment_count' => $dentist->appointments_count ?? 0,
            'subscription' => $dentist->subscriptionSummary(),
        ];
    }
}
