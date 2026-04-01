<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePatientCategoryRequest;
use App\Http\Requests\UpdatePatientCategoryRequest;
use App\Models\PatientCategory;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PatientCategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $categories = PatientCategory::query()
            ->where('dentist_id', $this->resolveDentistId($request))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $categories
                ->map(fn (PatientCategory $category): array => $this->transformCategory($category))
                ->values()
                ->all(),
        ]);
    }

    public function store(StorePatientCategoryRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $category = PatientCategory::create([
            'dentist_id' => $this->resolveDentistId($request),
            'name' => trim((string) $validated['name']),
            'color' => $validated['color'] ?? '#CBD5E1',
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return response()->json([
            'data' => $this->transformCategory($category),
        ], 201);
    }

    public function update(UpdatePatientCategoryRequest $request, string $id): JsonResponse
    {
        $category = $this->findOwnedCategory($request, $id);
        $validated = $request->validated();

        $category->update([
            'name' => trim((string) $validated['name']),
            'color' => $validated['color'] ?? '#CBD5E1',
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return response()->json([
            'data' => $this->transformCategory($category->fresh()),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $category = $this->findOwnedCategory($request, $id);
        $category->patients()->detach();
        $category->delete();

        return response()->json([], 204);
    }

    private function findOwnedCategory(Request $request, string $id): PatientCategory
    {
        return PatientCategory::query()
            ->where('id', $id)
            ->where('dentist_id', $this->resolveDentistId($request))
            ->firstOrFail();
    }

    private function resolveDentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    /**
     * @return array<string, int|string>
     */
    private function transformCategory(PatientCategory $category): array
    {
        return [
            'id' => (string) $category->id,
            'name' => $category->name,
            'color' => $category->color,
            'sort_order' => (int) $category->sort_order,
        ];
    }
}
