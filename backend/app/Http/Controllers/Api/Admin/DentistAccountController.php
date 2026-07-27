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
use App\Services\AccountAccessRevocationService;
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
        private readonly AccountAccessRevocationService $accessRevocation,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $search = $request->input('filter.search');
        $status = $request->input('filter.status');
        // Reject 1-character search terms — `LIKE '%a%'` forces a full table
        // scan that an admin or compromised admin session can issue rapidly
        // enough to DoS the DB. The throttle on the route is defense in
        // depth; this is the cheap filter.
        if (is_string($search) && trim($search) !== '' && mb_strlen(trim($search)) < 2) {
            throw ValidationException::withMessages([
                'filter.search' => ['Search term must be at least 2 characters.'],
            ]);
        }
        // Summary excludes soft-deleted accounts so the header strip stays
        // consistent with the default visible list. When the admin explicitly
        // opens the Archive view (include_deleted=1), the same scope makes
        // the summary reflect that filter too.
        $summaryQuery = User::query()
            ->where('role', User::ROLE_DENTIST)
            ->where('account_status', '!=', User::ACCOUNT_STATUS_DELETED);

        $query = User::query()
            ->where('role', User::ROLE_DENTIST)
            ->withCount([
                'patients',
                'appointments',
                'assistants as active_assistants_count' => fn (Builder $builder) => $builder
                    ->where('account_status', User::ACCOUNT_STATUS_ACTIVE),
                // Eager-load the total count so transformDentist's fallback
                // does not fire a per-row `assistants()->count()` (former N+1).
                'assistants as total_assistants_count' => fn (Builder $builder) => $builder
                    ->where('account_status', '!=', User::ACCOUNT_STATUS_DELETED),
            ])
            // Eager-load subscriptions + plan so `subscriptionSummary()` →
            // `currentForOwner()` reuses the preloaded relation instead of
            // hitting the DB once per dentist row (former N+1).
            ->with(['subscriptions.plan'])
            ->orderByDesc('created_at');

        if (is_string($search) && $search !== '') {
            // Postgres LIKE is case-sensitive; use the cross-DB helper.
            Search::ciLikeAny($query, ['name', 'email', 'practice_name'], $search);
        }

        if (is_string($status) && $status !== '') {
            $query->where('account_status', $status);
        } elseif (! $request->boolean('filter.include_deleted')) {
            // Hide soft-deleted accounts from the default list — admins
            // manage them from an explicit "Archive" view.
            $query->where('account_status', '!=', User::ACCOUNT_STATUS_DELETED);
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
        // Soft-deleted dentists do not get a staff roster: their account is
        // closed, the assistants are presumed transferred/inactive. Returning
        // PII here serves no admin diagnostic purpose and only widens the
        // surface for data leak.
        $dentist = $this->findDentist($id, false);

        // Exclude soft-deleted assistants from the admin roster. Their PII
        // (name, email, phone, last_login) should not appear once they have
        // been removed from active service; if forensic review is needed,
        // it should go through a dedicated audit-log surface, not the live
        // staff list.
        $staff = $dentist->assistants()
            ->where('account_status', '!=', User::ACCOUNT_STATUS_DELETED)
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
                plan: $this->findPlan(Plan::CODE_BASIC, expectPaid: true),
                billingPeriod: Subscription::PERIOD_MONTHLY,
                paymentMethod: $paymentMethod,
                paymentAmount: $paymentAmount,
                note: $note,
            ),
            'set_basic_yearly' => $this->subscriptionService->overridePlan(
                owner: $dentist,
                plan: $this->findPlan(Plan::CODE_BASIC, expectPaid: true),
                billingPeriod: Subscription::PERIOD_YEARLY,
                paymentMethod: $paymentMethod,
                paymentAmount: $paymentAmount,
                note: $note,
            ),
            'set_pro_monthly' => $this->subscriptionService->overridePlan(
                owner: $dentist,
                plan: $this->findPlan(Plan::CODE_PRO, expectPaid: true),
                billingPeriod: Subscription::PERIOD_MONTHLY,
                paymentMethod: $paymentMethod,
                paymentAmount: $paymentAmount,
                note: $note,
            ),
            'set_pro_yearly' => $this->subscriptionService->overridePlan(
                owner: $dentist,
                plan: $this->findPlan(Plan::CODE_PRO, expectPaid: true),
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

        // Emit a specific event type per action category so finance dashboards
        // and audit-log filters can separate cancellations, mark-only state
        // flips, and revenue-recording paid actions without scraping metadata.
        $eventType = match (true) {
            $action === 'cancel_at_period_end' => 'admin.dentist.subscription_cancel_at_period_end',
            $action === 'cancel_now' => 'admin.dentist.subscription_cancel_now',
            $action === 'mark_read_only' => 'admin.dentist.subscription_mark_read_only',
            $action === 'mark_active' => 'admin.dentist.subscription_mark_active',
            $action === 'set_trial' => 'admin.dentist.subscription_set_trial',
            default => 'admin.dentist.subscription_updated',
        };

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: $eventType,
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

        // Revoke active Sanctum tokens when blocking. Without this the
        // blocked dentist's existing PAT/cookie session keeps full access
        // until expiry — middleware EnsureRole catches the assistants on
        // their next request, but the dentist themselves can still hit
        // every endpoint that does not re-check account_status.
        //
        // Cascade to the dentist's assistants as well. Their tokens were
        // previously left in the DB until the middleware re-check fired on
        // the next request; that closes the access door at runtime but the
        // token row persists until expiry. A leaked PAT is the durable
        // attack surface — revoke it explicitly so token deletion is the
        // ground truth for "this account can no longer authenticate".
        $revokedCredentials = ['tokens' => 0, 'sessions' => 0];
        if ($status === User::ACCOUNT_STATUS_BLOCKED) {
            $revokedCredentials = $this->accessRevocation->revokeForUsers([
                $dentist,
                ...$dentist->assistants->all(),
            ]);
        }

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.dentist.status_updated',
            entityType: 'user',
            entityId: (string) $dentist->id,
            metadata: [
                'old_status' => $oldStatus,
                'new_status' => $status,
                'revoked_tokens' => $revokedCredentials['tokens'],
                'revoked_sessions' => $revokedCredentials['sessions'],
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
            // Force a rotation on next login so an admin-chosen password is
            // never a permanent credential. Mirrors the assistant flow in
            // TeamAssistantService::resetPassword.
            'must_change_password' => true,
        ]);

        // Revoke every reusable credential. Without this, an existing
        // session/PAT (or remember-me cookie) survives the password reset.
        // Cascade to assistants — their tokens were minted under the same
        // owner-tenant, and a dentist credential rotation should not leave
        // assistant PATs alive on the previous owner-state. (Their passwords
        // are separate, but token-bearer access does not need the password.)
        $this->accessRevocation->revokeForUsers([
            $dentist,
            ...$dentist->assistants->all(),
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

    public function verifyEmail(Request $request, string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, false);

        if ($dentist->email_verified_at === null) {
            $dentist->forceFill(['email_verified_at' => now()])->save();

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'admin.dentist.email_verified',
                entityType: 'user',
                entityId: (string) $dentist->id,
            );
        }

        return response()->json([
            'data' => $this->transformDentist($dentist->fresh()->loadCount(['patients', 'appointments'])),
        ]);
    }

    public function restore(Request $request, string $id): JsonResponse
    {
        $dentist = $this->findDentist($id, true);

        $startedTrial = false;
        if ($dentist->account_status === User::ACCOUNT_STATUS_DELETED) {
            $dentist->update([
                'account_status' => User::ACCOUNT_STATUS_ACTIVE,
            ]);

            // When the dentist was deleted, `destroy()` called
            // `cancelImmediately` on the subscription. Restoring the
            // account flips the status flag back to active, but leaves the
            // subscription in `canceled` / `read_only` — so the dentist
            // can log in but immediately bumps into a "subscription
            // inactive" wall. Mint a fresh trial as part of restore so
            // the admin's "un-delete" mental model actually returns the
            // user to a working state. `startTrial` is idempotent: if a
            // live subscription somehow still exists it activates it
            // instead of double-creating.
            try {
                $this->subscriptionService->startTrial(
                    owner: $dentist,
                    note: 'Trial restarted after account restore.',
                );
                $startedTrial = true;
            } catch (\Throwable $e) {
                // Trial provisioning is best-effort — the restore should
                // succeed even if a configuration issue blocks the trial
                // (e.g. trial plan inactive). Audit captures the outcome
                // so an admin investigating "why can't the dentist log
                // in" sees the failure path.
                $startedTrial = false;
            }

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'admin.dentist.restored',
                entityType: 'user',
                entityId: (string) $dentist->id,
                metadata: [
                    'previous_status' => User::ACCOUNT_STATUS_DELETED,
                    'new_status' => User::ACCOUNT_STATUS_ACTIVE,
                    'trial_restarted' => $startedTrial,
                ],
            );
        }

        return response()->json([
            'data' => $this->transformDentist($dentist->fresh()->loadCount(['patients', 'appointments'])),
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

        // Revoke every active Sanctum token so the deleted dentist can no
        // longer hit any endpoint via their existing session/PAT. Without
        // this they keep full access until token/cookie expiry. Cascade to
        // assistants for the same reason — see block-status comment above.
        $revokedCredentials = $this->accessRevocation->revokeForUsers([
            $dentist,
            ...$dentist->assistants->all(),
        ]);

        // Cancel the active subscription so revenue reporting and renewal
        // cycles stop treating a deleted dentist as an active payer.
        // cancelImmediately is idempotent and gracefully handles the
        // no-subscription case.
        $cancelledSubscription = false;
        try {
            $this->subscriptionService->cancelImmediately(
                owner: $dentist,
                note: 'Cancelled by admin.dentist.deleted cascade',
            );
            $cancelledSubscription = true;
        } catch (\Throwable $e) {
            // Subscription cancellation is best-effort — the delete must
            // succeed even if no subscription exists. Audit captures the
            // outcome for forensic review.
            $cancelledSubscription = false;
        }

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.dentist.deleted',
            entityType: 'user',
            entityId: (string) $dentist->id,
            metadata: [
                'old_status' => $oldStatus,
                'new_status' => User::ACCOUNT_STATUS_DELETED,
                'revoked_tokens' => $revokedCredentials['tokens'],
                'revoked_sessions' => $revokedCredentials['sessions'],
                'subscription_cancelled' => $cancelledSubscription,
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
            'email_verified' => $dentist->email_verified_at !== null,
            'avatar_url' => $dentist->avatar_url,
            'patient_count' => $dentist->patients_count ?? 0,
            'appointment_count' => $dentist->appointments_count ?? 0,
            'active_staff_count' => $dentist->activeAssistantsCount(),
            'total_staff_count' => (int) ($dentist->total_assistants_count ?? $dentist->assistants()->count()),
            'subscription' => $dentist->subscriptionSummary(),
        ];
    }

    /**
     * Resolve a plan by code with lockForUpdate so a concurrent admin
     * deactivation cannot race the assignment. The caller signals whether
     * the action is paid (Basic/Pro) so the helper enforces is_paid=true,
     * preventing accidental assignment of a paid action onto the trial
     * plan or a plan an admin deactivated mid-flow.
     */
    private function findPlan(string $code, bool $expectPaid = false): Plan
    {
        $query = Plan::query()
            ->where('code', $code)
            ->where('is_active', true)
            ->lockForUpdate();

        if ($expectPaid) {
            $query->where('is_paid', true);
        }

        /** @var Plan $plan */
        $plan = $query->first();

        if ($plan === null) {
            throw ValidationException::withMessages([
                'plan_code' => [$expectPaid
                    ? 'Plan is not available for paid assignment.'
                    : 'Plan is not available.'],
            ]);
        }

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
            'avatar_url' => $assistant->avatar_url,
            'account_status' => $assistant->account_status,
            'assistant_permissions' => $assistant->assistant_permissions ?? [],
            'must_change_password' => (bool) $assistant->must_change_password,
            'last_login_at' => $assistant->last_login_at?->toIso8601String(),
            'created_at' => $assistant->created_at?->toIso8601String(),
        ];
    }
}
