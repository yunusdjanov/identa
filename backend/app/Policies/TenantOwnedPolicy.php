<?php

namespace App\Policies;

use App\Contracts\TenantOwned;
use App\Models\User;

class TenantOwnedPolicy
{
    public function view(User $user, TenantOwned $model): bool
    {
        return $model->belongsToTenant($user);
    }

    public function update(User $user, TenantOwned $model): bool
    {
        return $model->belongsToTenant($user);
    }

    public function delete(User $user, TenantOwned $model): bool
    {
        return $model->belongsToTenant($user);
    }

    public function restore(User $user, TenantOwned $model): bool
    {
        return $model->belongsToTenant($user);
    }

    public function forceDelete(User $user, TenantOwned $model): bool
    {
        return $model->belongsToTenant($user);
    }

    public function download(User $user, TenantOwned $model): bool
    {
        return $model->belongsToTenant($user);
    }
}
