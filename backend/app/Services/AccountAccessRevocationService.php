<?php

namespace App\Services;

use App\Models\User;

class AccountAccessRevocationService
{
    public function __construct(
        private readonly SessionRevocationService $sessionRevocation,
    ) {}

    /**
     * Revoke every reusable credential for the selected accounts.
     *
     * Runtime status middleware still denies blocked users immediately, but
     * credential revocation prevents a stolen token, database session, or
     * remember-me cookie from becoming valid again after reactivation.
     *
     * @param  iterable<User>  $users
     * @return array{tokens: int, sessions: int}
     */
    public function revokeForUsers(iterable $users): array
    {
        $resolvedUsers = [];
        foreach ($users as $user) {
            $resolvedUsers[(string) $user->getKey()] = $user;
        }

        if ($resolvedUsers === []) {
            return ['tokens' => 0, 'sessions' => 0];
        }

        $tokenCount = 0;
        foreach ($resolvedUsers as $user) {
            $tokenCount += $user->tokens()->count();
            $user->tokens()->delete();

            if ($user->remember_token !== null) {
                $user->forceFill(['remember_token' => null])->save();
            }
        }

        return [
            'tokens' => $tokenCount,
            'sessions' => $this->sessionRevocation->revokeForUsers(array_values($resolvedUsers)),
        ];
    }
}
