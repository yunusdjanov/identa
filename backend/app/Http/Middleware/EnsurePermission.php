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

        // `hasActiveAccessChain` re-checks the owning dentist for
        // assistants — mirrors EnsureRole's contract so an assistant
        // whose dentist owner was blocked is bounced even if the route
        // chain skipped role middleware (defensive against future
        // refactors that add permission-only routes).
        if (! $user->hasActiveAccessChain()) {
            return response()->json([
                'error' => [
                    'code' => 'account_inactive',
                    'message' => __('api.auth.account_inactive'),
                ],
            ], Response::HTTP_FORBIDDEN);
        }

        foreach ($permissions as $permissionGroup) {
            $alternatives = array_filter(
                array_map('trim', explode('|', $permissionGroup)),
                static fn (string $permission): bool => $permission !== ''
            );

            if ($alternatives === []) {
                continue;
            }

            if ($this->hasAnyPermission($user, $alternatives)) {
                continue;
            }

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'auth.permission_denied',
                entityType: 'route',
                entityId: $request->path(),
                metadata: [
                    'required_permission' => $permissionGroup,
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

    /**
     * @param  array<int, string>  $permissions
     */
    private function hasAnyPermission(User $user, array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if ($user->hasPermission($permission)) {
                return true;
            }
        }

        return false;
    }
}
