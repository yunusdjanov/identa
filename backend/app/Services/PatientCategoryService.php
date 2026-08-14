<?php

namespace App\Services;

use App\Http\Requests\StorePatientCategoryRequest;
use App\Http\Requests\UpdatePatientCategoryRequest;
use App\Models\PatientCategory;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PatientCategoryService
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {}


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

        return DB::transaction(function () use ($request, $validated): PatientCategory {
            $dentistId = $this->dentistId($request);
            $this->lockTenant($dentistId);
            $this->ensureNameAvailable($dentistId, (string) $validated['name']);
            $category = PatientCategory::create([
                'dentist_id' => $dentistId,
                'name' => (string) $validated['name'],
                'color' => $validated['color'] ?? '#CBD5E1',
                'sort_order' => $validated['sort_order'] ?? 0,
            ]);

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'patient_category.created',
                entityType: 'patient_category',
                entityId: (string) $category->id,
                metadata: ['name' => $category->name],
            );

            return $category;
        });
    }

    public function update(UpdatePatientCategoryRequest $request, string $id): PatientCategory
    {
        $validated = $request->validated();

        return DB::transaction(function () use ($request, $id, $validated): PatientCategory {
            $dentistId = $this->dentistId($request);
            $this->lockTenant($dentistId);
            $category = $this->ownedCategory($request, $id, true);
            $this->ensureNameAvailable($dentistId, (string) $validated['name'], $id);
            $category->update([
                'name' => (string) $validated['name'],
                'color' => $validated['color'] ?? '#CBD5E1',
                'sort_order' => $validated['sort_order'] ?? 0,
            ]);

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'patient_category.updated',
                entityType: 'patient_category',
                entityId: (string) $category->id,
                metadata: ['name' => $category->name],
            );

            return $category->fresh();
        });
    }

    public function delete(Request $request, string $id): void
    {
        DB::transaction(function () use ($request, $id): void {
            $this->lockTenant($this->dentistId($request));
            $category = $this->ownedCategory($request, $id, true);
            $metadata = ['name' => $category->name];
            $category->patients()->detach();
            $category->delete();

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'patient_category.deleted',
                entityType: 'patient_category',
                entityId: $id,
                metadata: $metadata,
            );
        });
    }

    private function ownedCategory(Request $request, string $id, bool $lockForUpdate = false): PatientCategory
    {
        $query = PatientCategory::query()
            ->where('id', $id)
            ->where('dentist_id', $this->dentistId($request));

        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

        return $query->firstOrFail();
    }

    private function dentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    private function lockTenant(int $dentistId): void
    {
        User::query()
            ->whereKey($dentistId)
            ->lockForUpdate()
            ->firstOrFail(['id']);
    }

    private function ensureNameAvailable(int $dentistId, string $name, ?string $exceptId = null): void
    {
        $exists = PatientCategory::query()
            ->where('dentist_id', $dentistId)
            ->where('name', $name)
            ->when($exceptId !== null, fn ($query) => $query->where('id', '!=', $exceptId))
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'name' => [__('validation.unique', ['attribute' => 'name'])],
            ]);
        }
    }
}
