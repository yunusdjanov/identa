<?php

namespace App\Services;

use App\Models\User;
use App\Support\AuditLogger;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

class UnverifiedAccountCleanupService
{
    public function __construct(
        private readonly SubscriptionService $subscriptionService,
        private readonly AccountAccessRevocationService $accessRevocation,
        private readonly AuditLogger $auditLogger,
    ) {}

    /**
     * Expire abandoned public registrations without deleting tenant data.
     *
     * @return array{expired: int, retained: int}
     */
    public function expireOlderThan(CarbonInterface $cutoff): array
    {
        $expired = 0;
        $retained = 0;

        User::query()
            ->where('role', User::ROLE_DENTIST)
            ->where('account_status', User::ACCOUNT_STATUS_ACTIVE)
            ->whereNull('email_verified_at')
            // updated_at is the abandonment clock. It protects an older,
            // previously verified user who just changed their email from
            // being expired immediately because their created_at is old.
            ->where('updated_at', '<=', $cutoff)
            ->orderBy('id')
            ->select('id')
            ->chunkById(100, function ($users) use ($cutoff, &$expired, &$retained): void {
                foreach ($users as $user) {
                    $didExpire = $this->expireCandidate((int) $user->id, $cutoff);
                    $didExpire ? $expired++ : $retained++;
                }
            });

        return ['expired' => $expired, 'retained' => $retained];
    }

    private function expireCandidate(int $userId, CarbonInterface $cutoff): bool
    {
        return DB::transaction(function () use ($userId, $cutoff): bool {
            /** @var User|null $user */
            $user = User::query()->whereKey($userId)->lockForUpdate()->first();

            if (
                $user === null
                || ! $user->isDentist()
                || $user->account_status !== User::ACCOUNT_STATUS_ACTIVE
                || $user->hasVerifiedEmail()
                || $user->updated_at === null
                || $user->updated_at->isAfter($cutoff)
            ) {
                return false;
            }

            if ($this->hasProtectedTenantData($user)) {
                return false;
            }

            $this->subscriptionService->cancelImmediately(
                owner: $user,
                note: 'Expired abandoned unverified registration.',
            );

            $user->forceFill([
                'account_status' => User::ACCOUNT_STATUS_DELETED,
                'remember_token' => null,
                'email' => sprintf('expired-unverified-%s@deleted.invalid', $user->id),
            ])->save();

            $revoked = $this->accessRevocation->revokeForUsers([$user]);

            $this->auditLogger->log(
                actor: null,
                eventType: 'auth.unverified_registration_expired',
                entityType: 'user',
                entityId: (string) $user->id,
                metadata: [
                    'revoked_tokens' => $revoked['tokens'],
                    'revoked_sessions' => $revoked['sessions'],
                ],
                tenantDentistId: (int) $user->id,
            );

            return true;
        });
    }

    private function hasProtectedTenantData(User $user): bool
    {
        return $user->patients()->exists()
            || $user->patientCategories()->exists()
            || $user->appointments()->exists()
            || $user->invoices()->exists()
            || $user->payments()->exists()
            || $user->paymentExpenses()->exists()
            || $user->odontogramEntries()->exists()
            || $user->treatments()->exists()
            || $user->assistants()->exists()
            || $user->billingPayments()->exists();
    }
}
