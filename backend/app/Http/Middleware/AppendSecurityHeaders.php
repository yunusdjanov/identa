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
}
