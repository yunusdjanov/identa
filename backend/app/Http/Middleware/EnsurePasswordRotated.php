<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Hard-block mutation routes when the current user is in a forced
 * password-rotation state.
 *
 * Background: when an admin (or dentist owner) resets a user's password,
 * the user's record is flagged with `must_change_password = true`. The
 * web client redirects to /settings until the user clears the flag via
 * /auth/change-password, but that redirect is purely client-side — a
 * compromised session or a manually crafted API request could still
 * mutate data using the admin-chosen transient credential. This
 * middleware closes the loop on the API side: while the flag is set,
 * only read-only requests and the password-change/logout endpoints are
 * allowed; everything else returns 403 with `password_change_required`
 * so the client can surface a clear message.
 *
 * Read-only requests (GET / HEAD / OPTIONS) pass through so the
 * settings page itself can load /auth/me, plan info, and other context
 * needed to render the rotation form.
 */
class EnsurePasswordRotated
{
    /**
     * Route names that must remain callable while the rotation flag is
     * set — otherwise the user would be locked out of clearing it.
     * Matching by name (not path) means a future URI refactor (api/v2,
     * different prefix, etc.) won't silently lock users out — the
     * route name is the stable identity.
     */
    private const ALLOWED_MUTATION_ROUTE_NAMES = [
        'auth.change-password',
        'auth.logout',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        // Anything that doesn't mutate state can proceed — the client
        // needs /auth/me, dashboard snapshots, etc. to render the
        // rotation form. The flag only gates write paths.
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        if (! (bool) $user->must_change_password) {
            return $next($request);
        }

        $routeName = $request->route()?->getName();
        if ($routeName !== null && in_array($routeName, self::ALLOWED_MUTATION_ROUTE_NAMES, true)) {
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
