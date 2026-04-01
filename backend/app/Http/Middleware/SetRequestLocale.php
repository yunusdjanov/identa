<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class SetRequestLocale
{
    private const LOCALE_HEADER = 'X-Locale';
    private const LOCALE_COOKIE = 'odenta_locale';

    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $supportedLocales = $this->resolveSupportedLocales();
        $locale = $this->resolveRequestedLocale($request, $supportedLocales);

        if ($locale !== null) {
            App::setLocale($locale);
        }

        $response = $next($request);
        $response->headers->set('Content-Language', App::getLocale());

        return $response;
    }

    /**
     * @return list<string>
     */
    private function resolveSupportedLocales(): array
    {
        $configured = config('app.supported_locales', ['ru', 'uz', 'en']);
        if (! is_array($configured)) {
            return ['ru', 'uz', 'en'];
        }

        $normalized = array_values(
            array_filter(
                array_map(
                    static fn (mixed $locale): ?string => is_string($locale) && $locale !== ''
                        ? strtolower(trim($locale))
                        : null,
                    $configured
                ),
                static fn (?string $locale): bool => $locale !== null
            )
        );

        return $normalized !== [] ? $normalized : ['ru', 'uz', 'en'];
    }

    /**
     * @param  list<string>  $supportedLocales
     */
    private function resolveRequestedLocale(Request $request, array $supportedLocales): ?string
    {
        $fromHeader = $this->normalizeLocaleCandidate($request->header(self::LOCALE_HEADER));
        if ($fromHeader !== null && in_array($fromHeader, $supportedLocales, true)) {
            return $fromHeader;
        }

        $fromCookie = $this->normalizeLocaleCandidate($request->cookie(self::LOCALE_COOKIE));
        if ($fromCookie !== null && in_array($fromCookie, $supportedLocales, true)) {
            return $fromCookie;
        }

        $fromRawCookieHeader = $this->resolveLocaleFromRawCookieHeader($request);
        if ($fromRawCookieHeader !== null && in_array($fromRawCookieHeader, $supportedLocales, true)) {
            return $fromRawCookieHeader;
        }

        $acceptLanguageHeader = (string) $request->header('Accept-Language', '');
        foreach (explode(',', $acceptLanguageHeader) as $segment) {
            $candidate = $this->normalizeLocaleCandidate($segment);
            if ($candidate !== null && in_array($candidate, $supportedLocales, true)) {
                return $candidate;
            }
        }

        return null;
    }

    private function normalizeLocaleCandidate(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        $withoutQuality = trim(explode(';', $trimmed)[0] ?? '');
        if ($withoutQuality === '') {
            return null;
        }

        $normalized = strtolower(str_replace('_', '-', $withoutQuality));
        $primaryLocale = trim(explode('-', $normalized)[0] ?? '');

        return $primaryLocale !== '' ? $primaryLocale : null;
    }

    private function resolveLocaleFromRawCookieHeader(Request $request): ?string
    {
        $rawCookieHeader = $request->headers->get('Cookie');
        if (! is_string($rawCookieHeader) || $rawCookieHeader === '') {
            return null;
        }

        if (preg_match('/(?:^|;\s*)'.preg_quote(self::LOCALE_COOKIE, '/').'=(?<value>[^;]+)/', $rawCookieHeader, $matches) !== 1) {
            return null;
        }

        $rawValue = urldecode((string) ($matches['value'] ?? ''));

        return $this->normalizeLocaleCandidate($rawValue);
    }
}
