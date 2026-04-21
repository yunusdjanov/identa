<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Treatment extends Model
{
    /** @use HasFactory<\Database\Factories\TreatmentFactory> */
    use HasFactory, HasUuids;

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
        return $this->hasMany(TreatmentImage::class)->orderBy('created_at');
    }

    /**
     * @return HasOne<TreatmentImage>
     */
    public function primaryImage(): HasOne
    {
        return $this->hasOne(TreatmentImage::class)
            ->orderBy('created_at')
            ->orderBy('id');
    }
}
