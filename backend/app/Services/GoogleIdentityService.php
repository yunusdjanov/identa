<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class GoogleIdentityService
{
    /**
     * @return array{sub: string, email: string, email_verified: bool, name?: string|null, picture?: string|null}
     */
    public function verifyIdToken(string $idToken): array
    {
        $clientId = trim((string) config('services.google.client_id'));
        if ($clientId === '') {
            throw ValidationException::withMessages([
                'id_token' => ['Google auth is not configured.'],
            ]);
        }

        $response = Http::timeout(8)->acceptJson()->get(
            'https://oauth2.googleapis.com/tokeninfo',
            ['id_token' => $idToken]
        );

        if (! $response->ok()) {
            throw ValidationException::withMessages([
                'id_token' => ['Invalid Google token.'],
            ]);
        }

        $payload = $response->json();
        if (! is_array($payload)) {
            throw ValidationException::withMessages([
                'id_token' => ['Invalid Google token.'],
            ]);
        }

        $audience = (string) ($payload['aud'] ?? '');
        $issuer = (string) ($payload['iss'] ?? '');
        $subject = (string) ($payload['sub'] ?? '');
        $email = trim((string) ($payload['email'] ?? ''));
        $emailVerified = filter_var($payload['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (
            $audience !== $clientId
            || ! in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true)
            || $subject === ''
            || $email === ''
            || ! filter_var($email, FILTER_VALIDATE_EMAIL)
            || ! $emailVerified
        ) {
            throw ValidationException::withMessages([
                'id_token' => ['Invalid Google token.'],
            ]);
        }

        return [
            'sub' => $subject,
            'email' => $email,
            'email_verified' => true,
            'name' => isset($payload['name']) ? (string) $payload['name'] : null,
            'picture' => isset($payload['picture']) ? (string) $payload['picture'] : null,
        ];
    }
}
