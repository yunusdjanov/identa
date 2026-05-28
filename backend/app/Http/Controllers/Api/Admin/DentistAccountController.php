<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ManageDentistSubscriptionRequest;
use App\Http\Requests\Admin\ResetDentistPasswordRequest;
use App\Http\Requests\Admin\StoreDentistRequest;
use App\Http\Requests\Admin\UpdateDentistStatusRequest;
use App\Models\BillingPayment;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\SubscriptionService;
use App\Support\AuditLogger;
use App\Support\Search;
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
        private readonly SubscriptionService $subscriptionService,
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
            // Postgres LIKE is case-sensitive; use the cross-DB helper.
            Search::ciLikeAny($query, ['name', 'email', 'practice_name'], $search);
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
            // Admin-created accounts are trusted (the admin vouches for the
            // email), so they are pre-verified — only public self-service
            // registrations need to confirm their own email.
            'email_verified_at' => now(),
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

    public function show(string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, true)->loadCount(['patients', 'appointments']);

        return response()->json([
            'data' => $this->transformDentist($dentist),
        ]);
    }

    public function staff(string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, true);

        $staff = $dentist->assistants()
            ->orderBy('account_status')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $staff
                ->map(fn (User $assistant): array => $this->transformAssistant($assistant))
                ->values()
                ->all(),
        ]);
    }

    public function billing(string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, true)->loadCount([
            'patients',
            'appointments',
            'payments',
            'assistants as active_assistants_count' => fn (Builder $builder) => $builder
                ->where('account_status', User::ACCOUNT_STATUS_ACTIVE),
            'assistants as total_assistants_count',
        ]);

        $payments = $dentist->billingPayments()
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return response()->json([
            'data' => [
                'dentist' => $this->transformDentist($dentist),
                'subscription' => $dentist->subscriptionSummary(),
                'payments' => $payments
                    ->map(fn (BillingPayment $payment): array => $this->transformBillingPayment($payment))
                    ->values()
                    ->all(),
                'staff' => [
                    'active' => $dentist->activeAssistantsCount(),
                    'total' => (int) ($dentist->total_assistants_count ?? $dentist->assistants()->count()),
                ],
                'usage' => [
                    'patients' => (int) ($dentist->patients_count ?? 0),
                    'appointments' => (int) ($dentist->appointments_count ?? 0),
                    'payments' => (int) ($dentist->payments_count ?? 0),
                ],
            ],
        ]);
    }

    public function manageSubscription(ManageDentistSubscriptionRequest $request, string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, false);
        $validated = $request->validated();
        $action = (string) $validated['action'];
        $paymentMethod = $validated['payment_method'] ?? null;
        $paymentAmount = array_key_exists('payment_amount', $validated) && $validated['payment_amount'] !== null
            ? (float) $validated['payment_amount']
            : null;
        $note = isset($validated['note']) ? trim((string) $validated['note']) : null;
        $oldSubscription = $dentist->subscriptionSummary();

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
            'set_trial' => $this->subscriptionService->overridePlan(
                owner: $dentist,
                plan: $this->findPlan(Plan::CODE_TRIAL),
                billingPeriod: Subscription::PERIOD_TRIAL,
                note: $note,
            ),
            'set_basic_monthly' => $this->subscriptionService->overridePlan(
                owner: $dentist,
                plan: $this->findPlan(Plan::CODE_BASIC),
                billingPeriod: Subscription::PERIOD_MONTHLY,
                paymentMethod: $paymentMethod,
                paymentAmount: $paymentAmount,
                note: $note,
            ),
            'set_basic_yearly' => $this->subscriptionService->overridePlan(
                owner: $dentist,
                plan: $this->findPlan(Plan::CODE_BASIC),
                billingPeriod: Subscription::PERIOD_YEARLY,
                paymentMethod: $paymentMethod,
                paymentAmount: $paymentAmount,
                note: $note,
            ),
            'set_pro_monthly' => $this->subscriptionService->overridePlan(
                owner: $dentist,
                plan: $this->findPlan(Plan::CODE_PRO),
                billingPeriod: Subscription::PERIOD_MONTHLY,
                paymentMethod: $paymentMethod,
                paymentAmount: $paymentAmount,
                note: $note,
            ),
            'set_pro_yearly' => $this->subscriptionService->overridePlan(
                owner: $dentist,
                plan: $this->findPlan(Plan::CODE_PRO),
                billingPeriod: Subscription::PERIOD_YEARLY,
                paymentMethod: $paymentMethod,
                paymentAmount: $paymentAmount,
                note: $note,
            ),
            'mark_read_only' => $this->subscriptionService->markReadOnly($dentist, $note),
            'mark_active' => $this->subscriptionService->markActive($dentist, $note),
            'cancel_at_period_end' => $dentist->cancelSubscriptionAtPeriodEnd($note),
            'cancel_now' => $dentist->cancelSubscriptionImmediately($note),
        };

        $dentist = $dentist->fresh()->loadCount([
            'patients',
            'appointments',
            'assistants as active_assistants_count' => fn (Builder $builder) => $builder
                ->where('account_status', User::ACCOUNT_STATUS_ACTIVE),
            'assistants as total_assistants_count',
        ]);
        $newSubscription = $dentist->subscriptionSummary();

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
                'note' => $note,
                'old_subscription' => $oldSubscription,
                'new_subscription' => $newSubscription,
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
        $oldStatus = $dentist->account_status;

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
                'old_status' => $oldStatus,
                'new_status' => $status,
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

        $oldStatus = $dentist->account_status;

        $dentist->update([
            'account_status' => User::ACCOUNT_STATUS_DELETED,
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.dentist.deleted',
            entityType: 'user',
            entityId: (string) $dentist->id,
            metadata: [
                'old_status' => $oldStatus,
                'new_status' => User::ACCOUNT_STATUS_DELETED,
            ],
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
            'active_staff_count' => $dentist->activeAssistantsCount(),
            'total_staff_count' => (int) ($dentist->total_assistants_count ?? $dentist->assistants()->count()),
            'subscription' => $dentist->subscriptionSummary(),
        ];
    }

    private function findPlan(string $code): Plan
    {
        /** @var Plan $plan */
        $plan = Plan::query()->where('code', $code)->firstOrFail();

        return $plan;
    }

    /**
     * @return array<string, mixed>
     */
    private function transformBillingPayment(BillingPayment $payment): array
    {
        return [
            'id' => (string) $payment->id,
            'plan_code' => $payment->plan_code,
            'plan_name' => $payment->plan_name,
            'billing_period' => $payment->billing_period,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency,
            'status' => $payment->status,
            'provider' => $payment->provider,
            'provider_payment_id' => $payment->provider_payment_id,
            'provider_order_id' => $payment->provider_order_id,
            'paid_at' => $payment->paid_at?->toIso8601String(),
            'created_at' => $payment->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function transformAssistant(User $assistant): array
    {
        return [
            'id' => (string) $assistant->id,
            'name' => $assistant->name,
            'email' => $assistant->email,
            'phone' => $assistant->phone,
            'account_status' => $assistant->account_status,
            'assistant_permissions' => $assistant->assistant_permissions ?? [],
            'must_change_password' => (bool) $assistant->must_change_password,
            'last_login_at' => $assistant->last_login_at?->toIso8601String(),
            'created_at' => $assistant->created_at?->toIso8601String(),
        ];
    }
}
