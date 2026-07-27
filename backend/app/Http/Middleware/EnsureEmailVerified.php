<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureEmailVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'error' => [
                    'code' => 'unauthorized',
                    'message' => __('api.auth.authentication_required'),
                ],
            ], Response::HTTP_UNAUTHORIZED);
        }

        if ($user->hasVerifiedEmail()) {
            return $next($request);
        }

        return response()->json([
            'error' => [
                'code' => 'email_verification_required',
                'message' => __('api.auth.email_verification_required'),
            ],
        ], Response::HTTP_FORBIDDEN);
    }
}
