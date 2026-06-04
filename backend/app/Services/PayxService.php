<?php

namespace App\Services;

use App\Models\BillingPayment;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Thin PayX (payx.uz) integration.
 *
 * PayX exposes a deliberately small API:
 *   - POST {base_url}/api/v1/invoice
 *       Bearer {api_token}
 *       body: { amount, description, payer_reference }
 *       200 OK { uuid, pay_url, status: "pending", amount }
 *   - Webhook → POST {our_url}
 *       header: Authorization: Bearer {project_token}
 *       body: { user_id, amount, currency, transaction_id, timestamp }
 *
 * PayX does NOT expose refund, cancel, or status-check endpoints. The
 * webhook fires only when a payment succeeds; refunds and reversals are
 * handled manually by the merchant outside of the API.
 */
class PayxService
{
    /**
     * Create a PayX invoice for the given pending BillingPayment.
     *
     * @return array{checkout_url: string, provider_payment_id: string, payload: array<string, mixed>}
     */
    public function createCheckout(BillingPayment $payment, User $user): array
    {
        $baseUrl = rtrim((string) config('services.payx.base_url'), '/');
        $apiToken = trim((string) config('services.payx.api_token'));

        if ($baseUrl === '' || $apiToken === '') {
            throw ValidationException::withMessages([
                'payment' => ['PayX is not configured.'],
            ]);
        }

        $payload = [
            'amount' => (float) $payment->amount,
            'description' => sprintf(
                '%s %s subscription',
                $payment->plan_name,
                $payment->billing_period
            ),
            'payer_reference' => (string) $user->id,
        ];

        $response = Http::timeout(15)
            ->acceptJson()
            ->withToken($apiToken)
            ->post($baseUrl.'/api/v1/invoice', $payload);

        if (! $response->successful()) {
            throw ValidationException::withMessages([
                'payment' => ['PayX invoice request failed.'],
            ]);
        }

        $data = $response->json();
        if (! is_array($data)) {
            throw ValidationException::withMessages([
                'payment' => ['PayX invoice response is invalid.'],
            ]);
        }

        $payUrl = (string) ($data['pay_url'] ?? '');
        $uuid = (string) ($data['uuid'] ?? '');

        if ($uuid === '') {
            throw ValidationException::withMessages([
                'payment' => ['PayX uuid is missing.'],
            ]);
        }

        if (! Str::startsWith($payUrl, ['http://', 'https://'])) {
            throw ValidationException::withMessages([
                'payment' => ['PayX pay_url is missing.'],
            ]);
        }

        return [
            'checkout_url' => $payUrl,
            'provider_payment_id' => $uuid,
            'payload' => $data,
        ];
    }

    /**
     * Verify a webhook came from PayX by comparing the Bearer token in the
     * Authorization header to the configured project token.
     *
     * PayX uses a static project token rather than a per-request signature;
     * see the "Verifikatsiya (imzo tekshirish)" section in the official docs.
     */
    public function verifyWebhook(Request $request): bool
    {
        $projectToken = trim((string) config('services.payx.project_token'));
        if ($projectToken === '') {
            return false;
        }

        $bearer = (string) $request->bearerToken();
        if ($bearer === '') {
            return false;
        }

        return hash_equals($projectToken, $bearer);
    }
}
