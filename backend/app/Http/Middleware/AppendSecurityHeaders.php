<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AppendSecurityHeaders
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        if (!config('security.headers.enabled', true)) {
            return $response;
        }

        $headers = [
            'X-Frame-Options' => (string) config('security.headers.x_frame_options', 'DENY'),
            'X-Content-Type-Options' => (string) config('security.headers.x_content_type_options', 'nosniff'),
            'Referrer-Policy' => (string) config('security.headers.referrer_policy', 'no-referrer'),
            'Permissions-Policy' => (string) config(
                'security.headers.permissions_policy',
                'geolocation=(), microphone=(), camera=(), payment=()'
            ),
            'Content-Security-Policy' => (string) config(
                'security.headers.content_security_policy',
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
            ),
        ];

        foreach ($headers as $key => $value) {
            if ($value !== '') {
                $response->headers->set($key, $value);
            }
        }

        $this->normalizeSessionCookies($response);

        if ($this->shouldApplyHsts($request)) {
            $response->headers->set('Strict-Transport-Security', $this->buildHstsValue());
        }

        return $response;
    }

    private function shouldApplyHsts(Request $request): bool
    {
        $hstsEnabled = (bool) config('security.headers.hsts_enabled', false);

        if (!$hstsEnabled) {
            return false;
        }

        if ($request->isSecure()) {
            return true;
        }

        $forwardedProto = strtolower((string) $request->headers->get('X-Forwarded-Proto', ''));

        return $forwardedProto === 'https';
    }

    private function buildHstsValue(): string
    {
        $maxAge = max(0, (int) config('security.headers.hsts_max_age', 31536000));
        $directives = ["max-age={$maxAge}"];

        if ((bool) config('security.headers.hsts_include_subdomains', true)) {
            $directives[] = 'includeSubDomains';
        }

        if ((bool) config('security.headers.hsts_preload', false)) {
            $directives[] = 'preload';
        }

        return implode('; ', $directives);
    }

    private function normalizeSessionCookies(Response $response): void
    {
        $sameSite = $this->resolveCookieSameSite();
        $secure = $this->resolveCookieSecure();
        $partitioned = $sameSite === 'none'
            ? (bool) env('SESSION_PARTITIONED_COOKIE', (bool) config('session.partitioned', false))
            : false;
        $sessionCookieName = (string) config('session.cookie', 'laravel-session');

        foreach ($response->headers->getCookies() as $cookie) {
            if (! in_array($cookie->getName(), ['XSRF-TOKEN', $sessionCookieName], true)) {
                continue;
            }

            $updatedCookie = $cookie;

            if ($secure !== null) {
                $updatedCookie = $updatedCookie->withSecure($secure);
            }

            if ($sameSite !== null) {
                $updatedCookie = $updatedCookie->withSameSite($sameSite);
                $updatedCookie = $updatedCookie->withPartitioned($partitioned);
            }

            $response->headers->setCookie($updatedCookie);
        }
    }

    private function resolveCookieSameSite(): ?string
    {
        $sameSite = env('SESSION_SAME_SITE', config('session.same_site'));

        if (! is_string($sameSite) || trim($sameSite) === '') {
            return null;
        }

        return strtolower(trim($sameSite));
    }

    private function resolveCookieSecure(): ?bool
    {
        $configured = env('SESSION_SECURE_COOKIE', config('session.secure'));

        if (is_bool($configured)) {
            return $configured;
        }

        if (is_string($configured) && trim($configured) !== '') {
            $parsed = filter_var($configured, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

            if ($parsed !== null) {
                return $parsed;
            }
        }

        return null;
    }
}
