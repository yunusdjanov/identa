<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\AuditLogger;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePermission
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next, string ...$permissions): Response
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

        if (! $user->hasActiveAccount()) {
            return response()->json([
                'error' => [
                    'code' => 'account_inactive',
                    'message' => __('api.auth.account_inactive'),
                ],
            ], Response::HTTP_FORBIDDEN);
        }

        foreach ($permissions as $permission) {
            if ($user->hasPermission($permission)) {
                continue;
            }

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'auth.permission_denied',
                entityType: 'route',
                entityId: $request->path(),
                metadata: [
                    'required_permission' => $permission,
                    'method' => $request->method(),
                ],
            );

            return response()->json([
                'error' => [
                    'code' => 'forbidden',
                    'message' => __('api.auth.forbidden'),
                ],
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}

