<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LandingSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'currency',
        'trial_price_amount',
        'monthly_price_amount',
        'yearly_price_amount',
        'telegram_contact_url',
    ];

    protected function casts(): array
    {
        return [
            'trial_price_amount' => 'integer',
            'monthly_price_amount' => 'integer',
            'yearly_price_amount' => 'integer',
        ];
    }

    public static function current(): self
    {
        return static::query()->firstOrCreate([], [
            'currency' => 'UZS',
            'trial_price_amount' => 0,
            'monthly_price_amount' => 450000,
            'yearly_price_amount' => 4500000,
            'telegram_contact_url' => null,
        ]);
    }
}
