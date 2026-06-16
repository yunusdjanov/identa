<?php

namespace App\Models;

use App\Contracts\TenantOwned;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Patient extends Model implements TenantOwned
{
    /** @use HasFactory<\Database\Factories\PatientFactory> */
    use BelongsToTenant, HasFactory, HasUuids, SoftDeletes;

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
        'created_by_user_id',
        'updated_by_user_id',
        'patient_id',
        'full_name',
        'phone',
        'secondary_phone',
        'address',
        'date_of_birth',
        'gender',
        'medical_history',
        'allergies',
        'current_medications',
        'photo_disk',
        'photo_path',
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
            'date_of_birth' => 'date',
            'approved_at' => 'datetime',
            'scanned_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, Patient>
     */
    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }

    /**
     * @return BelongsTo<User, Patient>
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /**
     * @return BelongsTo<User, Patient>
     */
    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_user_id');
    }

    /**
     * @return HasMany<Appointment, Patient>
     */
    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class)
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('patients')
                    ->whereColumn('patients.id', 'appointments.patient_id')
                    ->whereColumn('patients.dentist_id', 'appointments.dentist_id');
            });
    }

    /**
     * @return HasMany<Invoice, Patient>
     */
    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class)
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('patients')
                    ->whereColumn('patients.id', 'invoices.patient_id')
                    ->whereColumn('patients.dentist_id', 'invoices.dentist_id');
            });
    }

    /**
     * @return HasMany<Payment, Patient>
     */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('patients')
                    ->whereColumn('patients.id', 'payments.patient_id')
                    ->whereColumn('patients.dentist_id', 'payments.dentist_id');
            });
    }

    /**
     * @return HasMany<OdontogramEntry, Patient>
     */
    public function odontogramEntries(): HasMany
    {
        return $this->hasMany(OdontogramEntry::class)
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('patients')
                    ->whereColumn('patients.id', 'odontogram_entries.patient_id')
                    ->whereColumn('patients.dentist_id', 'odontogram_entries.dentist_id');
            });
    }

    /**
     * @return HasMany<Treatment, Patient>
     */
    public function treatments(): HasMany
    {
        return $this->hasMany(Treatment::class)
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('patients')
                    ->whereColumn('patients.id', 'treatments.patient_id')
                    ->whereColumn('patients.dentist_id', 'treatments.dentist_id');
            });
    }

    /**
     * @return BelongsToMany<PatientCategory>
     */
    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(
            PatientCategory::class,
            'patient_category_patient',
            'patient_id',
            'patient_category_id'
        )
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('patients')
                    ->whereColumn('patients.id', 'patient_category_patient.patient_id')
                    ->whereColumn('patients.dentist_id', 'patient_categories.dentist_id');
            })
            ->withTimestamps();
    }

    /**
     * @return HasMany<PatientClinicalPhoto, Patient>
     */
    public function clinicalPhotos(): HasMany
    {
        return $this->hasMany(PatientClinicalPhoto::class);
    }

    /**
     * @return HasOne<PatientClinicalPhoto, Patient>
     */
    public function primaryOralPhoto(): HasOne
    {
        return $this->hasOne(PatientClinicalPhoto::class)
            ->whereIn('view_type', [
                PatientClinicalPhoto::VIEW_TYPE_SMILE,
                PatientClinicalPhoto::VIEW_TYPE_LEGACY_ORAL_PRIMARY,
            ])
            ->where('is_primary', true)
            ->orderByRaw(
                'case when view_type = ? then 0 else 1 end',
                [PatientClinicalPhoto::VIEW_TYPE_SMILE]
            );
    }

    /**
     * @return HasMany<PatientClinicalPhoto, Patient>
     */
    public function oralPhotos(): HasMany
    {
        return $this->hasMany(PatientClinicalPhoto::class)
            ->whereIn('view_type', PatientClinicalPhoto::READABLE_VIEW_TYPES)
            ->orderByDesc('is_primary')
            ->orderBy('sort_order')
            ->orderBy('created_at');
    }
}
