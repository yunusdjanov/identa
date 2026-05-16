<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePatientCategoryRequest;
use App\Http\Requests\UpdatePatientCategoryRequest;
use App\Http\Resources\PatientCategoryResource;
use App\Models\PatientCategory;
use App\Services\PatientCategoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PatientCategoryController extends Controller
{
    public function __construct(
        private readonly PatientCategoryService $categories,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->categories->list($request)
                ->map(fn (PatientCategory $category): array => $this->transformCategory($category))
                ->values()
                ->all(),
        ]);
    }

    public function store(StorePatientCategoryRequest $request): JsonResponse
    {
        return response()->json([
            'data' => $this->transformCategory($this->categories->create($request)),
        ], 201);
    }

    public function update(UpdatePatientCategoryRequest $request, string $id): JsonResponse
    {
        return response()->json([
            'data' => $this->transformCategory($this->categories->update($request, $id)),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->categories->delete($request, $id);

        return response()->json([], 204);
    }

    /**
     * @return array<string, int|string>
     */
    private function transformCategory(PatientCategory $category): array
    {
        return (new PatientCategoryResource($category))->resolve(request());
    }
}
