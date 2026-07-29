<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminDentistAuditLogController extends Controller
{
    private const DEFAULT_PER_PAGE = 10;
    private const MAX_PER_PAGE = 100;

    public function index(Request $request, string $id): JsonResponse
    {
        User::query()
            ->where('role', User::ROLE_DENTIST)
            ->findOrFail($id);

        $perPage = min(
            self::MAX_PER_PAGE,
            max(1, $request->integer('per_page', self::DEFAULT_PER_PAGE)),
        );

        $entries = AuditLog::query()
            ->with('actor')
            ->where(function (Builder $query) use ($id): void {
                $query->where('dentist_id', $id)
                    ->orWhere(function (Builder $entityQuery) use ($id): void {
                        $entityQuery
                            ->where('entity_type', 'user')
                            ->where('entity_id', $id);
                    });
            })
            ->latest('created_at')
            ->latest('id')
            ->paginate($perPage);

        return response()->json([
            'data' => $entries
                ->getCollection()
                ->map(fn (AuditLog $entry): array => (new AuditLogResource($entry))->resolve($request))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $entries->currentPage(),
                    'per_page' => $entries->perPage(),
                    'total' => $entries->total(),
                    'total_pages' => $entries->lastPage(),
                ],
            ],
        ]);
    }
}
