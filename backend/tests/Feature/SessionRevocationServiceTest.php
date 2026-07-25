<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SessionRevocationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SessionRevocationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_revokes_selected_database_sessions_and_preserves_the_exception(): void
    {
        config()->set('session.driver', 'database');

        $target = User::factory()->create();
        $otherUser = User::factory()->create();

        DB::table('sessions')->insert([
            $this->sessionRow('target-current', $target),
            $this->sessionRow('target-stale', $target),
            $this->sessionRow('other-session', $otherUser),
        ]);

        $deleted = app(SessionRevocationService::class)
            ->revokeForUsers([$target], 'target-current');

        $this->assertSame(1, $deleted);
        $this->assertDatabaseHas('sessions', ['id' => 'target-current']);
        $this->assertDatabaseMissing('sessions', ['id' => 'target-stale']);
        $this->assertDatabaseHas('sessions', ['id' => 'other-session']);
    }

    /**
     * @return array<string, mixed>
     */
    private function sessionRow(string $id, User $user): array
    {
        return [
            'id' => $id,
            'user_id' => $user->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'PHPUnit',
            'payload' => 'test-session',
            'last_activity' => now()->timestamp,
        ];
    }
}
