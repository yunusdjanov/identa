<?php

namespace App\Models;

use App\Contracts\TenantOwned;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentExpense extends Model implements TenantOwned
{
    /** @use HasFactory<\Database\Factories\PaymentExpenseFactory> */
    use BelongsToTenant, HasFactory, HasUuids;

    public const CURRENCY_UZS = 'UZS';

    public const CURRENCY_USD = 'USD';

    public const CURRENCIES = [
        self::CURRENCY_UZS,
        self::CURRENCY_USD,
    ];

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
        'title',
        'amount',
        'quantity',
        'currency',
        'expense_date',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'quantity' => 'decimal:2',
            'expense_date' => 'date',
        ];
    }

    /**
     * @return BelongsTo<User, PaymentExpense>
     */
    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }
}
