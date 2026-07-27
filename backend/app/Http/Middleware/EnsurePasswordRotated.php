<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restrict a forced-reset account to the explicit recovery allow-list.
 *
 * A transient credential must not be able to read patient or financial data
 * before it is rotated. Only the session probe, password change, verification
 * resend, logout, and CORS preflight remain available.
 */
class EnsurePasswordRotated
{
    /**
     * @var list<string>
     */
    private const ALLOWED_MUTATION_ROUTE_NAMES = [
        'auth.change-password',
        'auth.logout',
        'verification.send',
    ];

    /**
     * @var list<string>
     */
    private const ALLOWED_READ_ROUTE_NAMES = [
        'auth.me',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = $request->user();

        if (! $user || ! (bool) $user->must_change_password) {
            return $next($request);
        }

        if ($request->isMethod('OPTIONS')) {
            return $next($request);
        }

        $routeName = $request->route()?->getName();
        if (
            $routeName !== null
            && in_array($request->method(), ['GET', 'HEAD'], true)
            && in_array($routeName, self::ALLOWED_READ_ROUTE_NAMES, true)
        ) {
            return $next($request);
        }

        if (
            $routeName !== null
            && in_array($routeName, self::ALLOWED_MUTATION_ROUTE_NAMES, true)
        ) {
            return $next($request);
        }

        return response()->json([
            'error' => [
                'code' => 'password_change_required',
                'message' => __('api.auth.password_change_required'),
            ],
        ], Response::HTTP_FORBIDDEN);
    }
}
