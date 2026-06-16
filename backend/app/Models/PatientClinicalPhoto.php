<?php

namespace App\Models;

use App\Contracts\TenantOwned;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PatientClinicalPhoto extends Model implements TenantOwned
{
    /** @use HasFactory<\Database\Factories\PatientClinicalPhotoFactory> */
    use BelongsToTenant, HasFactory, HasUuids;

    public const VIEW_TYPE_LEGACY_ORAL_PRIMARY = 'oral_primary';

    public const VIEW_TYPE_SMILE = 'smile';

    public const VIEW_TYPE_TOP = 'top';

    public const VIEW_TYPE_BOTTOM = 'bottom';

    public const SCAN_STATUS_REJECTED = 'rejected';

    /**
     * @var list<string>
     */
    public const VIEW_TYPES = [
        self::VIEW_TYPE_SMILE,
        self::VIEW_TYPE_TOP,
        self::VIEW_TYPE_BOTTOM,
    ];

    /**
     * @var list<string>
     */
    public const READABLE_VIEW_TYPES = [
        self::VIEW_TYPE_LEGACY_ORAL_PRIMARY,
        self::VIEW_TYPE_SMILE,
        self::VIEW_TYPE_TOP,
        self::VIEW_TYPE_BOTTOM,
    ];

    /**
     * @var bool
     */
    public $incrementing = false;

    /**
     * @var string
     */
    protected $keyType = 'string';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'dentist_id',
        'patient_id',
        'view_type',
        'is_primary',
        'sort_order',
        'disk',
        'path',
        'mime_type',
        'file_size',
        'scan_status',
        'scan_result',
        'scan_provider',
        'quarantine_path',
        'approved_at',
        'scanned_at',
        'rejected_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'sort_order' => 'integer',
            'file_size' => 'integer',
            'approved_at' => 'datetime',
            'scanned_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, PatientClinicalPhoto>
     */
    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }

    /**
     * @return BelongsTo<Patient, PatientClinicalPhoto>
     */
    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * Normalize legacy and public oral-photo slot names to the persisted view type.
     */
    public static function normalizeViewType(?string $viewType): ?string
    {
        $normalized = strtolower(trim((string) $viewType));

        return match ($normalized) {
            '', self::VIEW_TYPE_LEGACY_ORAL_PRIMARY, self::VIEW_TYPE_SMILE => self::VIEW_TYPE_SMILE,
            self::VIEW_TYPE_TOP => self::VIEW_TYPE_TOP,
            self::VIEW_TYPE_BOTTOM => self::VIEW_TYPE_BOTTOM,
            default => null,
        };
    }
}
