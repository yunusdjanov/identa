<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OdontogramEntryImage extends Model
{
    /** @use HasFactory<\Database\Factories\OdontogramEntryImageFactory> */
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
        'odontogram_entry_id',
        'stage',
        'disk',
        'path',
        'mime_type',
        'file_size',
        'captured_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
            'captured_at' => 'date',
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
