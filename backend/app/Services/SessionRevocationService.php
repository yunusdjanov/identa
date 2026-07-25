<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class SessionRevocationService
{
    /**
     * Revoke database-backed browser sessions for the selected users.
     *
     * Personal access tokens are stored separately and must be revoked by the
     * caller. The optional exception is used by a self-service password change
     * so the browser performing the rotation can remain signed in while every
     * other browser session is invalidated.
     *
     * @param  iterable<User|int|string>  $users
     */
    public function revokeForUsers(iterable $users, ?string $exceptSessionId = null): int
    {
        if ((string) config('session.driver') !== 'database') {
            return 0;
        }

        $userIds = [];
        foreach ($users as $user) {
            $userId = $user instanceof User ? $user->getAuthIdentifier() : $user;
            if (is_numeric($userId) && (int) $userId > 0) {
                $userIds[] = (int) $userId;
            }
        }
        $userIds = array_values(array_unique($userIds));

        if ($userIds === []) {
            return 0;
        }

        $table = trim((string) config('session.table', 'sessions'));
        if ($table === '') {
            return 0;
        }

        $connection = config('session.connection');
        $query = DB::connection(is_string($connection) && $connection !== '' ? $connection : null)
            ->table($table)
            ->whereIn('user_id', $userIds);

        if (is_string($exceptSessionId) && $exceptSessionId !== '') {
            $query->where('id', '!=', $exceptSessionId);
        }

        return $query->delete();
    }
}
