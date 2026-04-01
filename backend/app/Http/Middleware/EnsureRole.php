<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'error' => [
                    'code' => 'unauthorized',
                    'message' => __('api.auth.authentication_required'),
                ],
            ], Response::HTTP_UNAUTHORIZED);
        }

        if (! in_array($user->role, $roles, true)) {
            return response()->json([
                'error' => [
                    'code' => 'forbidden',
                    'message' => __('api.auth.forbidden'),
                ],
            ], Response::HTTP_FORBIDDEN);
        }

        if (! $user->hasActiveAccount()) {
            return response()->json([
                'error' => [
                    'code' => 'account_inactive',
                    'message' => __('api.auth.account_inactive'),
                ],
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
