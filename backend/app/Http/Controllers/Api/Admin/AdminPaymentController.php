<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\BillingPayment;
use App\Models\User;
use App\Services\SubscriptionService;
use App\Support\AuditLogger;
use App\Support\Search;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminPaymentController extends Controller
{
    private const DEFAULT_PER_PAGE = 20;
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
        $provider = $request->input('filter.provider');
        $dentistId = $request->input('filter.dentist_id');
        $from = $request->input('filter.from');
        $to = $request->input('filter.to');

        $query = BillingPayment::query()
            ->with(['user:id,name,email,avatar_url'])
            ->orderByDesc('created_at');

        if (is_string($status) && $status !== '') {
            $query->where('status', $status);
        }
        if (is_string($provider) && $provider !== '') {
            $query->where('provider', $provider);
        }
        if (is_string($dentistId) && $dentistId !== '') {
            $query->where('user_id', $dentistId);
        }
        if (is_string($from) && $from !== '') {
            try {
                $query->where('created_at', '>=', Carbon::parse($from)->startOfDay());
            } catch (\Throwable) {
                // ignore invalid date
            }
        }
        if (is_string($to) && $to !== '') {
            try {
                $query->where('created_at', '<=', Carbon::parse($to)->endOfDay());
            } catch (\Throwable) {
                // ignore invalid date
            }
        }
        if (is_string($search) && $search !== '') {
            $query->whereHas('user', function (Builder $builder) use ($search): void {
                Search::ciLikeAny($builder, ['name', 'email'], $search);
            });
        }

        $payments = $query->paginate($this->resolvePerPage($request));

        // Summary aggregates over PAID payments only (revenue figures) and
        // RESPECTS the same dentist_id/from/to/search filters so the header
        // totals match the visible rows. We also group by currency so a
        // future multi-currency setup doesn't silently sum UZS + USD.
        $summaryBase = $this->applyPaidSummaryFilters(BillingPayment::query(), $request)
            ->where('status', BillingPayment::STATUS_PAID);

        $thisMonthStart = now()->startOfMonth();
        $thisYearStart = now()->startOfYear();

        // Per-currency totals. Each row: {currency, this_month, this_year,
        // all_time, paid_count}. Most tenants have a single currency (UZS)
        // so the rendered set is a single entry — the legacy flat summary
        // is derived from this row for backward compatibility.
        $totalsByCurrency = (clone $summaryBase)
            ->select([
                'currency',
                DB::raw('SUM(CASE WHEN paid_at >= ? THEN amount ELSE 0 END) AS this_month'),
                DB::raw('SUM(CASE WHEN paid_at >= ? THEN amount ELSE 0 END) AS this_year'),
                DB::raw('SUM(amount) AS all_time'),
                DB::raw('COUNT(*) AS paid_count'),
            ])
            ->addBinding($thisMonthStart, 'select')
            ->addBinding($thisYearStart, 'select')
            ->groupBy('currency')
            ->orderByDesc('all_time')
            ->get()
            ->map(fn ($row): array => [
                'currency' => (string) $row->currency,
                'this_month' => (float) $row->this_month,
                'this_year' => (float) $row->this_year,
                'all_time' => (float) $row->all_time,
                'paid_count' => (int) $row->paid_count,
            ])
            ->all();

        $primary = $totalsByCurrency[0] ?? [
            'currency' => 'UZS',
            'this_month' => 0.0,
            'this_year' => 0.0,
            'all_time' => 0.0,
            'paid_count' => 0,
        ];

        return response()->json([
            'data' => $payments->getCollection()
                ->map(fn (BillingPayment $payment): array => $this->transformPayment($payment))
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $payments->currentPage(),
                    'per_page' => $payments->perPage(),
                    'total' => $payments->total(),
                    'total_pages' => $payments->lastPage(),
                ],
                'summary' => [
                    'this_month' => $primary['this_month'],
                    'this_year' => $primary['this_year'],
                    'all_time' => $primary['all_time'],
                    'paid_count' => $primary['paid_count'],
                    'currency' => $primary['currency'],
                    'totals_by_currency' => $totalsByCurrency,
                ],
            ],
        ]);
    }

    /**
     * Apply the dentist_id / from / to / search filters from the request to
     * a query builder. Used by both the paginated list and the summary
     * aggregates so the visible rows and the header totals agree.
     */
    private function applyPaidSummaryFilters(Builder $query, Request $request): Builder
    {
        $dentistId = $request->input('filter.dentist_id');
        $from = $request->input('filter.from');
        $to = $request->input('filter.to');
        $search = $request->input('filter.search');

        if (is_string($dentistId) && $dentistId !== '') {
            $query->where('user_id', $dentistId);
        }
        if (is_string($from) && $from !== '') {
            try {
                $query->where('created_at', '>=', Carbon::parse($from)->startOfDay());
            } catch (\Throwable) {
                // ignore invalid date
            }
        }
        if (is_string($to) && $to !== '') {
            try {
                $query->where('created_at', '<=', Carbon::parse($to)->endOfDay());
            } catch (\Throwable) {
                // ignore invalid date
            }
        }
        if (is_string($search) && $search !== '') {
            $query->whereHas('user', function (Builder $builder) use ($search): void {
                Search::ciLikeAny($builder, ['name', 'email'], $search);
            });
        }

        return $query;
    }

    public function refund(Request $request, string $id): JsonResponse
    {
        return DB::transaction(function () use ($request, $id): JsonResponse {
            // Lock the row inside the transaction so a concurrent admin double-
            // click cannot pass the status check twice and produce two refund
            // events (with two read-only cascades and two audit pairs).
            /** @var BillingPayment $payment */
            $payment = BillingPayment::query()
                ->whereKey($id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($payment->status !== BillingPayment::STATUS_PAID) {
                throw ValidationException::withMessages([
                    'status' => [__('api.admin.only_paid_payments_can_be_refunded')],
                ]);
            }

            $oldStatus = $payment->status;
            $cascadeOutcome = 'no_subscription_link';

            $payment->forceFill([
                'status' => BillingPayment::STATUS_REFUNDED,
            ])->save();

            // If this payment funded the dentist's current subscription, lock
            // the account into read-only so the dentist does not retain paid
            // access after the refund. If the payment is for a PAST
            // subscription (already replaced), there is no access to revoke
            // but we still audit the outcome so finance can reconcile.
            if ($payment->subscription_id !== null) {
                /** @var User|null $owner */
                $owner = $payment->user()->first();
                if ($owner !== null) {
                    // forUpdate: lock the subscription row so the cascade
                    // classification below isn't TOCTOU against a PayX
                    // webhook completing between our read and markReadOnly's
                    // own lock. Data is still safe (markReadOnly acquires
                    // its own row lock) — without this, only the audit
                    // `cascade_outcome` label can mislead.
                    $currentSubscription = $this->subscriptionService->currentForOwner($owner, forUpdate: true);
                    if ($currentSubscription === null) {
                        $cascadeOutcome = 'no_current_subscription';
                    } elseif ($currentSubscription->id === $payment->subscription_id) {
                        $this->subscriptionService->markReadOnly($owner, 'Admin refund cascade');
                        $cascadeOutcome = 'cascaded_to_read_only';
                    } else {
                        // Refund applies to a PAST subscription; current sub is
                        // a different row (e.g. upgrade / re-activation since).
                        // Admin should review whether current access is correct.
                        $cascadeOutcome = 'refund_for_past_subscription';
                    }
                }
            }

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'admin.payment.refunded',
                entityType: 'billing_payment',
                entityId: (string) $payment->id,
                metadata: [
                    'old_status' => $oldStatus,
                    'new_status' => BillingPayment::STATUS_REFUNDED,
                    'amount' => (float) $payment->amount,
                    'currency' => $payment->currency,
                    'user_id' => (string) $payment->user_id,
                    'subscription_id' => $payment->subscription_id
                        ? (string) $payment->subscription_id
                        : null,
                    'cascade_outcome' => $cascadeOutcome,
                ],
            );

            // Mirror the cascade outcome on the affected user so the same
            // entry is discoverable when filtering audit logs by dentist.
            $this->auditLogger->log(
                actor: $request->user(),
                eventType: 'admin.dentist.payment_refunded',
                entityType: 'user',
                entityId: (string) $payment->user_id,
                metadata: [
                    'payment_id' => (string) $payment->id,
                    'amount' => (float) $payment->amount,
                    'currency' => $payment->currency,
                    'cascade_outcome' => $cascadeOutcome,
                ],
                ipAddress: $request->ip(),
                userAgent: $request->userAgent(),
            );

            $payment->load('user:id,name,email,avatar_url');

            return response()->json([
                'data' => $this->transformPayment($payment->fresh(['user'])),
                'meta' => [
                    'cascade_outcome' => $cascadeOutcome,
                ],
            ]);
        });
    }

    private function resolvePerPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformPayment(BillingPayment $payment): array
    {
        $dentist = $payment->user;

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
            'dentist' => $dentist === null ? null : [
                'id' => (string) $dentist->id,
                'name' => $dentist->name,
                'email' => $dentist->email,
                'avatar_url' => $dentist->avatar_url,
            ],
        ];
    }
}
