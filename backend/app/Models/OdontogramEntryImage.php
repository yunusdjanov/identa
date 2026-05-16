<?php

namespace App\Models;

use App\Contracts\TenantOwned;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OdontogramEntryImage extends Model implements TenantOwned
{
    /** @use HasFactory<\Database\Factories\OdontogramEntryImageFactory> */
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
        'odontogram_entry_id',
        'stage',
        'disk',
        'path',
        'mime_type',
        'file_size',
        'captured_at',
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
            'file_size' => 'integer',
            'captured_at' => 'date',
            'approved_at' => 'datetime',
            'scanned_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<OdontogramEntry, OdontogramEntryImage>
     */
    public function odontogramEntry(): BelongsTo
    {
        return $this->belongsTo(OdontogramEntry::class);
    }

    /**
     * @return BelongsTo<User, OdontogramEntryImage>
     */
    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }
}
