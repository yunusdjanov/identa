<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OdontogramEntry extends Model
{
    /** @use HasFactory<\Database\Factories\OdontogramEntryFactory> */
    use HasFactory, HasUuids;

    public const TYPE_HEALTHY = 'healthy';
    public const TYPE_CAVITY = 'cavity';
    public const TYPE_FILLING = 'filling';
    public const TYPE_CROWN = 'crown';
    public const TYPE_ROOT_CANAL = 'root_canal';
    public const TYPE_EXTRACTION = 'extraction';
    public const TYPE_IMPLANT = 'implant';

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
        'condition_type',
        'surface',
        'material',
        'severity',
        'condition_date',
        'notes',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'tooth_number' => 'integer',
            'condition_date' => 'date',
        ];
    }

    /**
     * @return BelongsTo<User, OdontogramEntry>
     */
    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }

    /**
     * @return BelongsTo<Patient, OdontogramEntry>
     */
    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * @return HasMany<OdontogramEntryImage, OdontogramEntry>
     */
    public function images(): HasMany
    {
        return $this->hasMany(OdontogramEntryImage::class)->orderBy('created_at');
    }

    /**
     * @return HasMany<InvoiceItem, OdontogramEntry>
     */
    public function invoiceItems(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }
}
