<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_access_dentist_accounts_endpoint(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(2)->create();

        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/admin/dentists')
            ->assertOk()
            ->assertJsonStructure([
                'data',
                'meta' => [
                    'pagination' => [
                        'page',
                        'per_page',
                        'total',
                        'total_pages',
                    ],
                ],
            ]);
    }

    public function test_dentist_is_forbidden_from_admin_endpoint(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/admin/dentists')
            ->assertForbidden();
    }

    public function test_guest_is_unauthorized_for_admin_endpoint(): void
    {
        $this->getJson('/api/v1/admin/dentists')
            ->assertUnauthorized();
    }
}

