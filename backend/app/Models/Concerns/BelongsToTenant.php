<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

trait BelongsToTenant
{
    public function tenantId(): ?int
    {
        $tenantId = $this->getAttribute('dentist_id');

        return is_numeric($tenantId) ? (int) $tenantId : null;
    }

    public function belongsToTenant(User $user): bool
    {
        $tenantId = $user->tenantDentistId();

        return $tenantId !== null && $this->tenantId() === (int) $tenantId;
    }

    /**
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    public function scopeForTenant(Builder $query, User|int $tenant): Builder
    {
        $tenantId = $tenant instanceof User ? $tenant->tenantDentistId() : $tenant;

        if ($tenantId === null) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where($this->getTable().'.dentist_id', (int) $tenantId);
    }
}
