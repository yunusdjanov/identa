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

    public const VIEW_TYPE_ORAL_PRIMARY = 'oral_primary';

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
}
