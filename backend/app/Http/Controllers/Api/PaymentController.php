<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePaymentRequest;
use App\Http\Requests\UpdatePaymentRequest;
use App\Http\Resources\PaymentResource;
use App\Models\Payment;
use App\Services\PaymentService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly PaymentService $payments,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $result = $this->payments->list($request);
        $payments = $result['payments'];

        return response()->json([
            'data' => $payments
                ->getCollection()
                ->map(fn (Payment $payment): array => $this->transformPayment($payment))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $payments->currentPage(),
                    'per_page' => $payments->perPage(),
                    'total' => $payments->total(),
                    'total_pages' => $payments->lastPage(),
                ],
                'summary' => $result['summary'],
            ],
        ]);
    }

    public function store(StorePaymentRequest $request): JsonResponse
    {
        $payment = $this->payments->create($request);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment.created',
            entityType: 'payment',
            entityId: (string) $payment->id,
            metadata: [
                'invoice_id' => (string) $payment->invoice_id,
                'amount' => (float) $payment->amount,
            ],
        );

        return response()->json([
            'data' => $this->transformPayment($payment),
        ], 201);
    }

    public function update(UpdatePaymentRequest $request, string $id): JsonResponse
    {
        $payment = $this->payments->update($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment.updated',
            entityType: 'payment',
            entityId: (string) $payment->id,
            metadata: [
                'invoice_id' => (string) $payment->invoice_id,
                'amount' => (float) $payment->amount,
            ],
        );

        return response()->json([
            'data' => $this->transformPayment($payment),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->payments->delete($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment.deleted',
            entityType: 'payment',
            entityId: $id,
            metadata: [],
        );

        return response()->json([], 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformPayment(Payment $payment): array
    {
        return (new PaymentResource($payment))->resolve(request());
    }
}
