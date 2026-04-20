<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadRequest extends Model
{
    use HasFactory;

    public const STATUS_NEW = 'new';
    public const STATUS_CONTACTED = 'contacted';
    public const STATUS_CLOSED = 'closed';

    protected $fillable = [
        'name',
        'phone',
        'clinic_name',
        'city',
        'note',
        'status',
        'handled_by_admin_id',
        'handled_at',
    ];

    protected function casts(): array
    {
        return [
            'handled_by_admin_id' => 'integer',
            'handled_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, LeadRequest>
     */
    public function handledByAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by_admin_id');
    }
}
