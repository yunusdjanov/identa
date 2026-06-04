<?php

use App\Http\Middleware\AttachRequestContext;
use App\Http\Middleware\AppendSecurityHeaders;
use App\Http\Middleware\EnsurePasswordRotated;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsurePlanFeature;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureSubscriptionAccess;
use App\Http\Middleware\ForceApiJsonAccept;
use App\Http\Middleware\SetRequestLocale;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request as IlluminateRequest;
use Illuminate\Validation\ValidationException;
use Sentry\Laravel\Integration;
use Symfony\Component\HttpFoundation\Exception\BadRequestException;
use Symfony\Component\HttpFoundation\Request as SymfonyRequest;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

foreach ([
    __DIR__.'/../storage/framework/cache/data',
    __DIR__.'/../storage/framework/sessions',
    __DIR__.'/../storage/framework/views',
] as $directory) {
    if (! is_dir($directory)) {
        mkdir($directory, 0775, true);
    }
}

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
            'plan.feature' => EnsurePlanFeature::class,
            'subscription.access' => EnsureSubscriptionAccess::class,
            // `password.fresh` blocks mutations until the user clears
            // `must_change_password` via /auth/change-password. Applied
            // to every authenticated mutation group so the forced-reset
            // contract is enforced server-side, not just by the
            // client's redirect logic. See EnsurePasswordRotated.
            'password.fresh' => EnsurePasswordRotated::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Excluded BEFORE Sentry integration so the "ignore" list takes
        // effect for both reporting AND breadcrumbs. Without this every
        // failed login (AuthenticationException), every 422 form error
        // (ValidationException), every 404 (ModelNotFoundException), and
        // every 429 (ThrottleRequestsException) ships a Sentry event,
        // burning quota AND attaching request bodies that often contain
        // the wrong password the user just typed. These exceptions are
        // operational signals, not bugs — they belong in access logs,
        // not error monitoring.
        $exceptions->dontReport([
            AuthenticationException::class,
            AuthorizationException::class,
            ValidationException::class,
            ModelNotFoundException::class,
            NotFoundHttpException::class,
            ThrottleRequestsException::class,
            // 4xx HttpException — covers manual `abort(403)` calls etc.
            HttpException::class,
        ]);
        Integration::handles($exceptions);
        $exceptions->render(function (AuthenticationException $exception, IlluminateRequest $request) {
            if (! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'message' => __('auth.unauthenticated'),
            ], 401);
        });

        // Generic 500 fallback. Without this, an uncaught Throwable that
        // expects JSON falls through to Laravel's default renderer which
        // honours APP_DEBUG — if a production env ever ships with
        // APP_DEBUG=true (the validator catches it at boot but doesn't
        // catch a runtime config:cache miss), the raw stack trace + SQL
        // would land in the API response. This wraps everything in a
        // shape-stable 500 so the frontend can localise it the same way
        // every other 5xx is handled. ValidationException + the rest of
        // the dontReport list are still handled by Laravel's earlier
        // renderers; this is purely the catch-all tail.
        $exceptions->render(function (Throwable $exception, IlluminateRequest $request) {
            if (! $request->expectsJson()) {
                return null;
            }
            // Let Laravel's built-in HTTP exception renderer handle
            // 4xx — only 5xx and unclassified errors fall into the
            // generic 500 envelope below.
            if ($exception instanceof HttpException && $exception->getStatusCode() < 500) {
                return null;
            }
            if (
                $exception instanceof ValidationException
                || $exception instanceof AuthenticationException
                || $exception instanceof AuthorizationException
                || $exception instanceof ModelNotFoundException
                || $exception instanceof NotFoundHttpException
                || $exception instanceof ThrottleRequestsException
            ) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => 'server_error',
                    'message' => __('api.errors.server_error'),
                ],
            ], 500);
        });
    })->create();
