<?php

namespace Tests\Unit;

use App\Models\User;
use Tests\TestCase;

class UserModelTest extends TestCase
{
    public function test_role_and_account_status_helpers_return_expected_values(): void
    {
        $admin = new User([
            'role' => User::ROLE_ADMIN,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);
        $dentist = new User([
            'role' => User::ROLE_DENTIST,
            'account_status' => User::ACCOUNT_STATUS_BLOCKED,
        ]);
        $assistant = new User([
            'role' => User::ROLE_ASSISTANT,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
            'dentist_owner_id' => 55,
            'assistant_permissions' => [User::PERMISSION_PATIENTS_VIEW],
        ]);

        $this->assertTrue($admin->isAdmin());
        $this->assertFalse($admin->isDentist());
        $this->assertTrue($admin->hasActiveAccount());

        $this->assertFalse($dentist->isAdmin());
        $this->assertTrue($dentist->isDentist());
        $this->assertFalse($dentist->isAssistant());
        $this->assertFalse($dentist->hasActiveAccount());

        $this->assertFalse($assistant->isAdmin());
        $this->assertFalse($assistant->isDentist());
        $this->assertTrue($assistant->isAssistant());
        $this->assertTrue($assistant->hasActiveAccount());
        $this->assertSame(55, $assistant->tenantDentistId());
        $this->assertTrue($assistant->hasPermission(User::PERMISSION_PATIENTS_VIEW));
        $this->assertFalse($assistant->hasPermission(User::PERMISSION_PAYMENTS_MANAGE));
        $this->assertFalse($assistant->hasPermission(User::PERMISSION_SETTINGS_VIEW));
        $this->assertFalse($assistant->hasPermission(User::PERMISSION_AUDIT_LOGS_VIEW));
    }

    public function test_active_access_chain_requires_account_and_owner_to_be_active(): void
    {
        $activeDentist = new User([
            'role' => User::ROLE_DENTIST,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);
        $blockedDentist = new User([
            'role' => User::ROLE_DENTIST,
            'account_status' => User::ACCOUNT_STATUS_BLOCKED,
        ]);

        $this->assertTrue($activeDentist->hasActiveAccessChain());
        $this->assertFalse($blockedDentist->hasActiveAccessChain());

        // An assistant under an active owner has access.
        $owner = new User(['role' => User::ROLE_DENTIST, 'account_status' => User::ACCOUNT_STATUS_ACTIVE]);
        $assistant = new User(['role' => User::ROLE_ASSISTANT, 'account_status' => User::ACCOUNT_STATUS_ACTIVE]);
        $assistant->setRelation('ownerDentist', $owner);
        $this->assertTrue($assistant->hasActiveAccessChain());

        // ...but loses it the moment the owner is blocked, even with its own
        // account still active (instant, non-destructive revocation).
        $blockedOwner = new User(['role' => User::ROLE_DENTIST, 'account_status' => User::ACCOUNT_STATUS_BLOCKED]);
        $assistantOfBlocked = new User(['role' => User::ROLE_ASSISTANT, 'account_status' => User::ACCOUNT_STATUS_ACTIVE]);
        $assistantOfBlocked->setRelation('ownerDentist', $blockedOwner);
        $this->assertFalse($assistantOfBlocked->hasActiveAccessChain());

        // An orphaned assistant (no owner) is denied.
        $orphan = new User(['role' => User::ROLE_ASSISTANT, 'account_status' => User::ACCOUNT_STATUS_ACTIVE]);
        $orphan->setRelation('ownerDentist', null);
        $this->assertFalse($orphan->hasActiveAccessChain());
    }
}
