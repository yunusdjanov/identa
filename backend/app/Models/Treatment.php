<?php

namespace App\Models;

use App\Contracts\TenantOwned;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Treatment extends Model implements TenantOwned
{
    /** @use HasFactory<\Database\Factories\TreatmentFactory> */
    use BelongsToTenant, HasFactory, HasUuids;

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
        'tooth_number',
        'teeth',
        'treatment_type',
        'description',
        'comment',
        'treatment_date',
        'cost',
        'debt_amount',
        'paid_amount',
        'notes',
        'before_image_disk',
        'before_image_path',
        'after_image_disk',
        'after_image_path',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'tooth_number' => 'integer',
            'teeth' => 'array',
            'treatment_date' => 'date',
            'cost' => 'decimal:2',
            'debt_amount' => 'decimal:2',
            'paid_amount' => 'decimal:2',
        ];
    }

    /**
     * @return BelongsTo<User, Treatment>
     */
    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }

    /**
     * @return BelongsTo<User, Treatment>
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /**
     * @return BelongsTo<User, Treatment>
     */
    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_user_id');
    }

    /**
     * @return BelongsTo<Patient, Treatment>
     */
    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * @return HasMany<TreatmentImage, Treatment>
     */
    public function images(): HasMany
    {
        return $this->hasMany(TreatmentImage::class)
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('treatments')
                    ->whereColumn('treatments.id', 'treatment_images.treatment_id')
                    ->whereColumn('treatments.dentist_id', 'treatment_images.dentist_id');
            })
            ->where(function ($query): void {
                $query->whereNull('scan_status')
                    ->orWhere('scan_status', '!=', 'rejected');
            })
            ->orderBy('created_at');
    }

    /**
     * @return HasOne<TreatmentImage>
     */
    public function primaryImage(): HasOne
    {
        return $this->hasOne(TreatmentImage::class)
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('treatments')
                    ->whereColumn('treatments.id', 'treatment_images.treatment_id')
                    ->whereColumn('treatments.dentist_id', 'treatment_images.dentist_id');
            })
            ->where('scan_status', 'approved')
            ->orderBy('created_at')
            ->orderBy('id');
    }
}
