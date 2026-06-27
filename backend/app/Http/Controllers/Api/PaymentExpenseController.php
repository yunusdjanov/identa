<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePaymentExpenseRequest;
use App\Models\PaymentExpense;
use App\Services\PaymentExpenseService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PaymentExpenseController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly PaymentExpenseService $expenses,
    ) {}

    /**
     * GET /api/v1/payments/expenses
     *
     * Auth: payments.view. Query: page, per_page, filter[search],
     * filter[date_from], filter[date_to]. Returns practice expenses plus
     * summary totals for the Expenses tab.
     */
    public function index(Request $request): JsonResponse
    {
        $result = $this->expenses->list($request);
        $expenses = $result['expenses'];

        return response()->json([
            'data' => $expenses
                ->getCollection()
                ->map(fn (PaymentExpense $expense): array => $this->expenseRow($expense))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $expenses->currentPage(),
                    'per_page' => $expenses->perPage(),
                    'total' => $expenses->total(),
                    'total_pages' => $expenses->lastPage(),
                ],
                'summary' => $result['summary'],
            ],
        ]);
    }

    /**
     * POST /api/v1/payments/expenses
     *
     * Auth: payments.manage. Body: title, amount, quantity, currency, expense_date.
     */
    public function store(StorePaymentExpenseRequest $request): JsonResponse
    {
        $expense = $this->expenses->create($request);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment_expense.created',
            entityType: 'payment_expense',
            entityId: (string) $expense->id,
            metadata: [
                'title' => $expense->title,
                'amount' => (float) $expense->amount,
                'quantity' => (float) $expense->quantity,
                'currency' => $expense->currency,
                'expense_date' => $expense->expense_date?->toDateString(),
            ],
        );

        return response()->json([
            'data' => $this->expenseRow($expense),
        ], 201);
    }

    /**
     * PUT /api/v1/payments/expenses/{id}
     *
     * Auth: payments.manage. Body: title, amount, quantity, currency, expense_date.
     */
    public function update(StorePaymentExpenseRequest $request, string $id): JsonResponse
    {
        $expense = $this->expenses->update($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment_expense.updated',
            entityType: 'payment_expense',
            entityId: (string) $expense->id,
            metadata: [
                'title' => $expense->title,
                'amount' => (float) $expense->amount,
                'quantity' => (float) $expense->quantity,
                'currency' => $expense->currency,
                'expense_date' => $expense->expense_date?->toDateString(),
            ],
        );

        return response()->json([
            'data' => $this->expenseRow($expense),
        ]);
    }

    /**
     * DELETE /api/v1/payments/expenses/{id}
     *
     * Auth: payments.manage.
     */
    public function destroy(Request $request, string $id): Response
    {
        $expense = $this->expenses->delete($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment_expense.deleted',
            entityType: 'payment_expense',
            entityId: (string) $expense->id,
            metadata: [
                'title' => $expense->title,
                'amount' => (float) $expense->amount,
                'quantity' => (float) $expense->quantity,
                'currency' => $expense->currency,
                'expense_date' => $expense->expense_date?->toDateString(),
            ],
        );

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function expenseRow(PaymentExpense $expense): array
    {
        return [
            'id' => (string) $expense->id,
            'title' => $expense->title,
            'amount' => (float) $expense->amount,
            'quantity' => (float) $expense->quantity,
            'currency' => $expense->currency,
            'expense_date' => $expense->expense_date?->toDateString(),
            'created_at' => $expense->created_at?->toISOString(),
            'updated_at' => $expense->updated_at?->toISOString(),
        ];
    }
}
