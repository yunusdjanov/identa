<?php

namespace Tests\Unit;

use App\Models\BillingPayment;
use App\Models\Subscription;
use App\Models\User;
use App\Services\PayxService;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class PayxServiceTest extends TestCase
{
    public function test_checkout_rejects_an_insecure_provider_redirect(): void
    {
        config()->set('services.payx.api_token', 'test-api-token');
        config()->set('services.payx.base_url', 'https://test.payx.uz');

        Http::fake([
            'test.payx.uz/api/v1/invoice' => Http::response([
                'uuid' => 'payx-uuid',
                'pay_url' => 'http://test.payx.uz/pay/insecure',
                'status' => 'pending',
                'amount' => 120000,
            ]),
        ]);

        $payment = (new BillingPayment)->forceFill([
            'amount' => 120000,
            'plan_name' => 'Basic',
            'billing_period' => Subscription::PERIOD_MONTHLY,
        ]);
        $user = (new User)->forceFill(['id' => 10]);

        $this->expectException(ValidationException::class);

        app(PayxService::class)->createCheckout($payment, $user);
    }
}
