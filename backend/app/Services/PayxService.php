<?php

namespace App\Services;

use App\Models\BillingPayment;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PayxService
{
    /**
     * @return array<string, mixed>
     */
    public function createCheckout(BillingPayment $payment, User $user): array
    {
        $baseUrl = rtrim((string) config('services.payx.base_url'), '/');
        $apiKey = trim((string) config('services.payx.api_key'));
        $merchantId = trim((string) config('services.payx.merchant_id'));

        if ($baseUrl === '' || $apiKey === '' || $merchantId === '') {
            throw ValidationException::withMessages([
                'payment' => ['PayX is not configured.'],
            ]);
        }

        $payload = [
            'merchant_id' => $merchantId,
            'order_id' => $payment->provider_order_id,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency,
            'description' => sprintf('%s %s subscription', $payment->plan_name, $payment->billing_period),
            'return_url' => config('services.payx.return_url'),
            'cancel_url' => config('services.payx.cancel_url'),
            'webhook_url' => url('/api/v1/webhooks/payx'),
            'customer' => [
                'id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
            ],
        ];

        $response = Http::timeout(15)
            ->acceptJson()
            ->withToken($apiKey)
            ->post($baseUrl.'/checkout', $payload);

        if (! $response->successful()) {
            throw ValidationException::withMessages([
                'payment' => ['PayX checkout request failed.'],
            ]);
        }

        $data = $response->json();
        if (! is_array($data)) {
            throw ValidationException::withMessages([
                'payment' => ['PayX checkout response is invalid.'],
            ]);
        }

        $checkoutUrl = $data['checkout_url']
            ?? $data['payment_url']
            ?? $data['redirect_url']
            ?? data_get($data, 'data.checkout_url')
            ?? data_get($data, 'data.payment_url')
            ?? data_get($data, 'data.redirect_url');

        if (! is_string($checkoutUrl) || ! Str::startsWith($checkoutUrl, ['http://', 'https://'])) {
            throw ValidationException::withMessages([
                'payment' => ['PayX checkout URL is missing.'],
            ]);
        }

        return [
            'checkout_url' => $checkoutUrl,
            'provider_payment_id' => $data['payment_id'] ?? data_get($data, 'data.payment_id'),
            'payload' => $data,
        ];
    }

    public function verifyWebhook(Request $request): bool
    {
        $secret = trim((string) config('services.payx.webhook_secret'));
        if ($secret === '') {
            return false;
        }

        $signature = (string) (
            $request->header('X-PayX-Signature')
            ?? $request->header('X-Payx-Signature')
            ?? $request->input('signature')
            ?? ''
        );

        if ($signature === '') {
            return false;
        }

        $rawSignature = hash_hmac('sha256', $request->getContent(), $secret);
        if (hash_equals($rawSignature, $signature) || hash_equals(strtoupper($rawSignature), strtoupper($signature))) {
            return true;
        }

        $orderId = trim((string) (
            $request->input('provider_order_id')
            ?? $request->input('order_id')
            ?? $request->input('identifier')
            ?? data_get($request->input('data'), 'provider_order_id')
            ?? data_get($request->input('data'), 'order_id')
            ?? data_get($request->input('data'), 'identifier')
            ?? ''
        ));
        $amount = trim((string) ($request->input('amount') ?? data_get($request->input('data'), 'amount') ?? ''));
        if ($orderId === '' || $amount === '') {
            return false;
        }

        $legacySignature = strtoupper(hash_hmac('sha256', $amount.$orderId, $secret));

        return hash_equals($legacySignature, strtoupper($signature));
    }
}
