<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQuickPaymentRequest;
use App\Http\Resources\PaymentResource;
use App\Services\QuickPaymentService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;

/**
 * Mobile-friendly payment endpoint: creates an Invoice + Payment in one
 * atomic call, scoped to a {patient} route parameter.
 *
 * Endpoint: POST /api/v1/patients/{id}/quick-payments
 *
 * Sibling to PaymentController. The latter requires an invoice_id; this
 * one synthesizes the invoice from the request. The same PaymentResource
 * shape is returned so the mobile only needs one client-side decoder.
 */
class QuickPaymentController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly QuickPaymentService $quickPayments,
    ) {}

    public function store(StoreQuickPaymentRequest $request, string $id): JsonResponse
    {
        $payment = $this->quickPayments->create($request);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment.quick_created',
            entityType: 'payment',
            entityId: (string) $payment->id,
            metadata: [
                'invoice_id' => (string) $payment->invoice_id,
                'patient_id' => $id,
                'amount' => (float) $payment->amount,
                'payment_method' => $payment->payment_method,
            ],
        );

        return response()->json([
            'data' => (new PaymentResource($payment))->resolve(request()),
        ], 201);
    }
}
