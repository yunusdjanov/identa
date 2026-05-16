<?php

namespace App\Services;

use App\Http\Requests\StorePatientCategoryRequest;
use App\Http\Requests\UpdatePatientCategoryRequest;
use App\Models\PatientCategory;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;

class PatientCategoryService
{
    /**
     * @return Collection<int, PatientCategory>
     */
    public function list(Request $request): Collection
    {
        return PatientCategory::query()
            ->where('dentist_id', $this->dentistId($request))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    public function create(StorePatientCategoryRequest $request): PatientCategory
    {
        $validated = $request->validated();

        return PatientCategory::create([
            'dentist_id' => $this->dentistId($request),
            'name' => trim((string) $validated['name']),
            'color' => $validated['color'] ?? '#CBD5E1',
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);
    }

    public function update(UpdatePatientCategoryRequest $request, string $id): PatientCategory
    {
        $category = $this->ownedCategory($request, $id);
        $validated = $request->validated();

        $category->update([
            'name' => trim((string) $validated['name']),
            'color' => $validated['color'] ?? '#CBD5E1',
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return $category->fresh();
    }

    public function delete(Request $request, string $id): void
    {
        $category = $this->ownedCategory($request, $id);
        $category->patients()->detach();
        $category->delete();
    }

    private function ownedCategory(Request $request, string $id): PatientCategory
    {
        return PatientCategory::query()
            ->where('id', $id)
            ->where('dentist_id', $this->dentistId($request))
            ->firstOrFail();
    }

    private function dentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }
}
