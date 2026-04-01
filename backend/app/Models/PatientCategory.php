<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class PatientCategory extends Model
{
    /** @use HasFactory<\Database\Factories\PatientCategoryFactory> */
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
        'name',
        'color',
        'sort_order',
    ];

    /**
     * @return BelongsTo<User, PatientCategory>
     */
    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }

    /**
     * @return BelongsToMany<Patient>
     */
    public function patients(): BelongsToMany
    {
        return $this->belongsToMany(
            Patient::class,
            'patient_category_patient',
            'patient_category_id',
            'patient_id'
        )->withTimestamps();
    }
}
