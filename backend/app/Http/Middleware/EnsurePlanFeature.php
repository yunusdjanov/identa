<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\PlanLimitService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePlanFeature
{
    public function __construct(
        private readonly PlanLimitService $planLimitService,
    ) {
    }

    public function handle(Request $request, Closure $next, string $feature): Response
    {
        /** @var User|null $user */
        $user = $request->user();
        $owner = $user?->subscriptionOwner();

        if ($owner !== null && $feature === 'export') {
            $this->planLimitService->ensureExportAvailable($owner);
        }

        return $next($request);
    }
}
