<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;

/**
 * Public (unauthenticated) marketing-landing data.
 *
 * The landing page renders pricing limits (staff/images/upload/export) from
 * this endpoint so it can never drift from what admins configure in
 * /admin/plans or what dentists see in billing. Only public, non-sensitive
 * plan facts are exposed.
 */
class LandingController extends Controller
{
    public function __construct(private readonly BillingService $billingService)
    {
    }

    public function plans(): JsonResponse
    {
        return response()->json([
            'data' => PlanResource::collection($this->billingService->activePlans())->resolve(),
        ]);
    }
}
