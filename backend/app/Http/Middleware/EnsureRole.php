<?php

namespace App\Http\Middleware;

use App\Models\User;
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

        if (! in_array($user->role, $roles, true)) {
            return response()->json([
                'error' => [
                    'code' => 'forbidden',
                    'message' => __('api.auth.forbidden'),
                ],
            ], Response::HTTP_FORBIDDEN);
        }

        // hasActiveAccessChain() also re-checks the owning dentist for assistants,
        // so blocking/deleting a dentist instantly revokes their staff on the next
        // request (including remember-me sessions that bypass the login service).
        if (! $user->hasActiveAccessChain()) {
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
