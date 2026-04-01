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
}
