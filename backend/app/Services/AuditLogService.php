<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\Search;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AuditLogService
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
     * Events hidden from the dentist's audit-log UI. We deliberately do
     * NOT hide `team.assistant.*` events — they're the exact rows a
     * dentist (or compromised-session investigator) should be able to
     * inspect: who created/blocked/reset-password-on/deleted which
     * assistant, and when. The previous hide list defeated the audit
     * trail for the very actions that matter most for tenant security.
     * `auth.login`/`auth.logout` stay hidden because they fire on every
     * page load — they would drown the panel in noise without forensic
     * value beyond what the session timeline already shows.
     *
     * @var list<string>
     */
    private const HIDDEN_EVENT_TYPES = [
        'auth.login',
        'auth.logout',
    ];

    public function list(Request $request): LengthAwarePaginator
    {
        $query = AuditLog::query()
            ->where('dentist_id', $this->dentistId($request))
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
            $query->where('created_at', '>=', Carbon::parse($dateFrom)->startOfDay());
        }

        $dateTo = $request->input('filter.date_to');
        if (is_string($dateTo) && $dateTo !== '') {
            $query->where('created_at', '<=', Carbon::parse($dateTo)->endOfDay());
        }

        $search = $request->input('filter.search');
        $search = is_string($search) ? trim($search) : '';
        // Require >= 2 chars and cap the length: a leading-wildcard LIKE on a
        // single character forces an unindexed full scan with no selectivity
        // (a mild DoS lever), and unbounded input bloats the query needlessly.
        if (mb_strlen($search) >= 2) {
            $term = mb_substr($search, 0, 100);
            $query->where(function (Builder $builder) use ($term): void {
                Search::ciLike($builder, 'event_type', $term);
                Search::ciLike($builder, 'entity_type', $term, 'or');
                Search::ciLike($builder, 'entity_id', $term, 'or');
                $builder->orWhereHas('actor', function (Builder $actorQuery) use ($term): void {
                    Search::ciLike($actorQuery, 'name', $term);
                    Search::ciLike($actorQuery, 'email', $term, 'or');
                });
            });
        }

        $this->applySort($query, $request->query('sort', '-created_at'));

        return $query->paginate($this->perPage($request));
    }

    /**
     * Event types are derived from the tenant's visible audit trail so the
     * frontend filter cannot drift behind newly added backend events.
     *
     * @return list<string>
     */
    public function eventTypes(Request $request): array
    {
        return AuditLog::query()
            ->where('dentist_id', $this->dentistId($request))
            ->whereNotIn('event_type', self::HIDDEN_EVENT_TYPES)
            ->whereNotNull('event_type')
            ->distinct()
            ->orderBy('event_type')
            ->pluck('event_type')
            ->filter(fn (mixed $eventType): bool => is_string($eventType) && $eventType !== '')
            ->values()
            ->all();
    }

    private function dentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    private function perPage(Request $request): int
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
}
