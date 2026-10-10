<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Team\ResetAssistantPasswordRequest;
use App\Http\Requests\Team\StoreAssistantRequest;
use App\Http\Requests\Team\UpdateAssistantRequest;
use App\Http\Requests\Team\UpdateAssistantStatusRequest;
use App\Http\Resources\AssistantResource;
use App\Models\User;
use App\Services\TeamAssistantService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TeamAssistantController extends Controller
{
    public function __construct(
        private readonly TeamAssistantService $team,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $result = $this->team->list($request);
        $assistants = $result['assistants'];

        return response()->json([
            'data' => collect($assistants->items())
                ->map(fn (User $assistant): array => $this->transformAssistant($assistant))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $assistants->currentPage(),
                    'per_page' => $assistants->perPage(),
                    'total' => $assistants->total(),
                    'total_pages' => $assistants->lastPage(),
                ],
                'summary' => $result['summary'],
            ],
        ]);
    }

    public function store(StoreAssistantRequest $request): JsonResponse
    {
        $assistant = $this->team->create($request);

        return response()->json([
            'data' => $this->transformAssistant($assistant),
        ], 201);
    }

    public function update(UpdateAssistantRequest $request, string $id): JsonResponse
    {
        $assistant = $this->team->update($request, $id);

        return response()->json([
            'data' => $this->transformAssistant($assistant),
        ]);
    }

    public function updateStatus(UpdateAssistantStatusRequest $request, string $id): JsonResponse
    {
        $assistant = $this->team->updateStatus($request, $id);

        return response()->json([
            'data' => $this->transformAssistant($assistant),
        ]);
    }

    public function resetPassword(ResetAssistantPasswordRequest $request, string $id): JsonResponse
    {
        $assistant = $this->team->resetPassword($request, $id);

        return response()->json([
            'data' => [
                'assistant_id' => (string) $assistant->id,
                'password_reset' => true,
            ],
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->team->delete($request, $id);

        return response()->json([], 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformAssistant(User $assistant): array
    {
        return (new AssistantResource($assistant))->resolve(request());
    }
}
