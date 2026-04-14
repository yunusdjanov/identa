<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSubscriptionAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = $request->user();
        $subscriptionOwner = $user?->subscriptionOwner();

        if ($subscriptionOwner === null || in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        if (! $subscriptionOwner->usesReadOnlyAccess()) {
            return $next($request);
        }

        return new JsonResponse([
            'error' => [
                'code' => 'subscription_read_only',
                'message' => __('api.subscription.read_only'),
            ],
        ], Response::HTTP_FORBIDDEN);
    }
}
