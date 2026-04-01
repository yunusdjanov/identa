<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    private const DEFAULT_PER_PAGE = 20;
    private const MAX_PER_PAGE = 100;

    /**
     * @var list<string>
     */
    private const ALLOWED_SORT_FIELDS = [
        'created_at',
        'event_type',
    ];

    /**
     * @var list<string>
     */
    private const HIDDEN_EVENT_TYPES = [
        'auth.login',
        'auth.logout',
        'team.assistant.created',
        'team.assistant.updated',
        'team.assistant.status_updated',
        'team.assistant.password_reset',
        'team.assistant.deleted',
    ];

    public function index(Request $request): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $perPage = $this->resolvePerPage($request);

        $query = AuditLog::query()
            ->where('dentist_id', $dentistId)
            ->whereNotIn('event_type', self::HIDDEN_EVENT_TYPES)
            ->with('actor:id,name,email,role');

        $eventType = $request->input('filter.event_type');
        if (is_string($eventType) && $eventType !== '') {
            $query->where('event_type', $eventType);
        }

        $actorId = $request->input('filter.actor_id');
        if (is_string($actorId) && $actorId !== '') {
            $query->where('actor_id', $actorId);
        }

        $entityType = $request->input('filter.entity_type');
        if (is_string($entityType) && $entityType !== '') {
            $query->where('entity_type', $entityType);
        }

        $dateFrom = $request->input('filter.date_from');
        if (is_string($dateFrom) && $dateFrom !== '') {
            $query->whereDate('created_at', '>=', $dateFrom);
        }

        $dateTo = $request->input('filter.date_to');
        if (is_string($dateTo) && $dateTo !== '') {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        $search = $request->input('filter.search');
        if (is_string($search) && $search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('event_type', 'like', "%{$search}%")
                    ->orWhere('entity_type', 'like', "%{$search}%")
                    ->orWhere('entity_id', 'like', "%{$search}%")
                    ->orWhereHas('actor', function (Builder $actorQuery) use ($search): void {
                        $actorQuery
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }

        $this->applySort($query, $request->query('sort', '-created_at'));
        $entries = $query->paginate($perPage);

        return response()->json([
            'data' => $entries
                ->getCollection()
                ->map(fn (AuditLog $entry): array => $this->transformEntry($entry))
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

    private function resolveDentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    private function resolvePerPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function applySort(Builder $query, mixed $sort): void
    {
        if (! is_string($sort) || $sort === '') {
            $query->orderByDesc('created_at');

            return;
        }

        $applied = false;
        foreach (explode(',', $sort) as $segment) {
            $segment = trim($segment);
            if ($segment === '') {
                continue;
            }

            $direction = str_starts_with($segment, '-') ? 'desc' : 'asc';
            $field = ltrim($segment, '-');

            if (! in_array($field, self::ALLOWED_SORT_FIELDS, true)) {
                continue;
            }

            $query->orderBy($field, $direction);
            $applied = true;
        }

        if (! $applied) {
            $query->orderByDesc('created_at');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function transformEntry(AuditLog $entry): array
    {
        return [
            'id' => (string) $entry->id,
            'event_type' => $entry->event_type,
            'entity_type' => $entry->entity_type,
            'entity_id' => $entry->entity_id,
            'actor_role' => $entry->actor_role,
            'actor' => $entry->actor !== null
                ? [
                    'id' => (string) $entry->actor->id,
                    'name' => $entry->actor->name,
                    'email' => $entry->actor->email,
                    'role' => $entry->actor->role,
                ]
                : null,
            'ip_address' => $entry->ip_address,
            'user_agent' => $entry->user_agent,
            'metadata' => $entry->metadata,
            'created_at' => $entry->created_at?->toIso8601String(),
        ];
    }
}
