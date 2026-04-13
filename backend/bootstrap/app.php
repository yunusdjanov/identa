<?php

use App\Http\Middleware\AttachRequestContext;
use App\Http\Middleware\AppendSecurityHeaders;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\ForceApiJsonAccept;
use App\Http\Middleware\SetRequestLocale;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request as IlluminateRequest;
use Sentry\Laravel\Integration;
use Symfony\Component\HttpFoundation\Request as SymfonyRequest;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $configuredTrustedProxies = env('TRUSTED_PROXIES');
        $trustedProxies = null;

        if (is_string($configuredTrustedProxies) && trim($configuredTrustedProxies) !== '') {
            $trimmedProxies = trim($configuredTrustedProxies);
            $trustedProxies = $trimmedProxies === '*'
                ? '*'
                : array_values(array_filter(
                    array_map(static fn (string $value): string => trim($value), explode(',', $trimmedProxies)),
                    static fn (string $value): bool => $value !== ''
                ));
        }

        $defaultTrustedProxyHeaders =
            SymfonyRequest::HEADER_X_FORWARDED_FOR
            | SymfonyRequest::HEADER_X_FORWARDED_HOST
            | SymfonyRequest::HEADER_X_FORWARDED_PROTO
            | SymfonyRequest::HEADER_X_FORWARDED_PORT
            | SymfonyRequest::HEADER_X_FORWARDED_PREFIX;

        $trustedProxyHeaders = (int) env('TRUSTED_PROXY_HEADERS', (string) $defaultTrustedProxyHeaders);

        $middleware->trustProxies(
            at: $trustedProxies,
            headers: $trustedProxyHeaders
        );

        $middleware->append(SetRequestLocale::class);
        $middleware->append(ForceApiJsonAccept::class);
        $middleware->append(AttachRequestContext::class);
        $middleware->append(AppendSecurityHeaders::class);
        $middleware->statefulApi();
        $middleware->alias([
            'role' => EnsureRole::class,
            'permission' => EnsurePermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);
        $exceptions->render(function (AuthenticationException $exception, IlluminateRequest $request) {
            if (! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'message' => __('auth.unauthenticated'),
            ], 401);
        });
    })->create();
