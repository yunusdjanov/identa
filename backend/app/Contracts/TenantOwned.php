<?php

namespace App\Contracts;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

interface TenantOwned
{
    public function tenantId(): ?int;

    public function belongsToTenant(User $user): bool;

    /**
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    public function scopeForTenant(Builder $query, User|int $tenant): Builder;
}
