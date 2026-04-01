<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Sentry\Laravel\Integration as SentryIntegration;
use Sentry\State\Scope;
use Symfony\Component\HttpFoundation\Response;

class AttachRequestContext
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $incomingRequestId = $request->header('X-Request-Id');
        $requestId = is_string($incomingRequestId) && $incomingRequestId !== ''
            ? $incomingRequestId
            : (string) Str::uuid();

        $request->attributes->set('request_id', $requestId);
        Log::withContext([
            'request_id' => $requestId,
            'method' => $request->method(),
            'path' => $request->path(),
            'ip' => $request->ip(),
            'user_id' => $request->user()?->id,
        ]);

        if (class_exists(SentryIntegration::class)) {
            SentryIntegration::configureScope(function (Scope $scope) use ($request, $requestId): void {
                $scope->setTag('request_id', $requestId);
                $scope->setContext('http_request', [
                    'method' => $request->method(),
                    'path' => $request->path(),
                ]);

                $authenticatedUser = $request->user();
                if ($authenticatedUser !== null && method_exists($authenticatedUser, 'getAuthIdentifier')) {
                    $userData = ['id' => (string) $authenticatedUser->getAuthIdentifier()];

                    if (isset($authenticatedUser->role) && is_string($authenticatedUser->role)) {
                        $userData['role'] = $authenticatedUser->role;
                    }

                    $scope->setUser($userData);
                }
            });
        }

        $response = $next($request);
        $response->headers->set('X-Request-Id', $requestId);

        return $response;
    }
}
