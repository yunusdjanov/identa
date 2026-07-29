<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Models\AuditLog;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLogs,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $entries = $this->auditLogs->list($request);

        return response()->json([
            'data' => $entries
                ->getCollection()
                ->map(fn (AuditLog $entry): array => $this->transformEntry($entry))
                ->values()
                ->all(),
            'meta' => [
                'event_types' => $this->auditLogs->eventTypes($request),
                'pagination' => [
                    'page' => $entries->currentPage(),
                    'per_page' => $entries->perPage(),
                    'total' => $entries->total(),
                    'total_pages' => $entries->lastPage(),
                ],
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformEntry(AuditLog $entry): array
    {
        return (new AuditLogResource($entry))->resolve(request());
    }
}
