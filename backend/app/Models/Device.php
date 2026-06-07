<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Device extends Model
{
    /** @use HasFactory<\Database\Factories\DeviceFactory> */
    use HasFactory, HasUuids;

    public const PLATFORM_IOS = 'ios';

    public const PLATFORM_ANDROID = 'android';

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
        'user_id',
        'expo_push_token',
        'platform',
        'app_version',
        'device_name',
        'last_registered_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_registered_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, Device>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
