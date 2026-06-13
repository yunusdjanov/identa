<?php

namespace App\Http\Resources\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

trait SerializesRecordActors
{
    /**
     * @return array{id: string, name: string, role: string}|null
     */
    protected function actorSummary(Model $model, string $relation): ?array
    {
        if (! $model->relationLoaded($relation)) {
            return null;
        }

        $actor = $model->getRelation($relation);
        if (! $actor instanceof User) {
            return null;
        }

        return [
            'id' => (string) $actor->id,
            'name' => $actor->name,
            'role' => $actor->role,
        ];
    }
}
