<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\User;
use App\Services\UnverifiedAccountCleanupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EmailVerificationAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_unverified_user_can_access_account_recovery_but_not_practice_data(): void
    {
        $dentist = User::factory()->unverified()->create();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email_verified', false);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/settings/profile')
            ->assertOk();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'email_verification_required');

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/billing/current-subscription')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'email_verification_required');
    }

    public function test_cleanup_expires_only_abandoned_accounts_without_protected_data(): void
    {
        config()->set('session.driver', 'database');

        $abandoned = User::factory()->unverified()->create([
            'created_at' => now()->subDays(31),
            'updated_at' => now()->subDays(31),
            'remember_token' => 'remember-me',
        ]);
        $abandoned->createToken('stale-token');
        DB::table('sessions')->insert([
            'id' => 'unverified-stale-session',
            'user_id' => $abandoned->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'test',
            'payload' => 'test-session',
            'last_activity' => now()->timestamp,
        ]);

        $dataOwner = User::factory()->unverified()->create([
            'created_at' => now()->subDays(31),
            'updated_at' => now()->subDays(31),
        ]);
        Patient::factory()->create(['dentist_id' => $dataOwner->id]);

        $recentlyUpdated = User::factory()->unverified()->create([
            'created_at' => now()->subYear(),
            'updated_at' => now()->subDay(),
        ]);

        $result = app(UnverifiedAccountCleanupService::class)
            ->expireOlderThan(now()->subDays(30));

        $this->assertSame(['expired' => 1, 'retained' => 1], $result);
        $this->assertSame(User::ACCOUNT_STATUS_DELETED, $abandoned->fresh()->account_status);
        $this->assertStringStartsWith('expired-unverified-', $abandoned->fresh()->email);
        $this->assertNull($abandoned->fresh()->remember_token);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $abandoned->id,
        ]);
        $this->assertDatabaseMissing('sessions', ['id' => 'unverified-stale-session']);

        $this->assertSame(User::ACCOUNT_STATUS_ACTIVE, $dataOwner->fresh()->account_status);
        $this->assertNull($dataOwner->fresh()->email_verified_at);
        $this->assertSame(User::ACCOUNT_STATUS_ACTIVE, $recentlyUpdated->fresh()->account_status);
    }
}
