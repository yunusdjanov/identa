<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const ROLE_ADMIN = 'admin';
    public const ROLE_DENTIST = 'dentist';
    public const ROLE_ASSISTANT = 'assistant';
    public const ACCOUNT_STATUS_ACTIVE = 'active';
    public const ACCOUNT_STATUS_BLOCKED = 'blocked';
    public const ACCOUNT_STATUS_DELETED = 'deleted';
    public const SUBSCRIPTION_PLAN_TRIAL = 'trial';
    public const SUBSCRIPTION_PLAN_MONTHLY = 'monthly';
    public const SUBSCRIPTION_PLAN_YEARLY = 'yearly';
    public const SUBSCRIPTION_STATUS_NONE = 'none';
    public const SUBSCRIPTION_STATUS_TRIALING = 'trialing';
    public const SUBSCRIPTION_STATUS_ACTIVE = 'active';
    public const SUBSCRIPTION_STATUS_GRACE = 'grace';
    public const SUBSCRIPTION_STATUS_READ_ONLY = 'read_only';
    public const SUBSCRIPTION_ACCESS_FULL = 'full';
    public const SUBSCRIPTION_ACCESS_READ_ONLY = 'read_only';
    public const SUBSCRIPTION_TRIAL_DAYS = 30;
    public const SUBSCRIPTION_GRACE_DAYS = 3;
    public const STAFF_LIMIT_TRIAL = 1;
    public const STAFF_LIMIT_MONTHLY = 3;
    public const STAFF_LIMIT_YEARLY = 5;
    public const PERMISSION_TEAM_MANAGE = 'team.manage';
    public const PERMISSION_AUDIT_LOGS_VIEW = 'audit_logs.view';
    public const PERMISSION_PATIENTS_VIEW = 'patients.view';
    public const PERMISSION_PATIENTS_MANAGE = 'patients.manage';
    public const PERMISSION_APPOINTMENTS_VIEW = 'appointments.view';
    public const PERMISSION_APPOINTMENTS_MANAGE = 'appointments.manage';
    public const PERMISSION_INVOICES_VIEW = 'invoices.view';
    public const PERMISSION_INVOICES_MANAGE = 'invoices.manage';
    public const PERMISSION_PAYMENTS_VIEW = 'payments.view';
    public const PERMISSION_PAYMENTS_MANAGE = 'payments.manage';
    public const PERMISSION_ODONTOGRAM_VIEW = 'odontogram.view';
    public const PERMISSION_ODONTOGRAM_MANAGE = 'odontogram.manage';
    public const PERMISSION_TREATMENTS_VIEW = 'treatments.view';
    public const PERMISSION_TREATMENTS_MANAGE = 'treatments.manage';
    public const PERMISSION_PATIENT_CATEGORIES_VIEW = 'patient_categories.view';
    public const PERMISSION_PATIENT_CATEGORIES_MANAGE = 'patient_categories.manage';
    public const PERMISSION_SETTINGS_VIEW = 'settings.view';
    public const PERMISSION_SETTINGS_MANAGE = 'settings.manage';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'phone',
        'practice_name',
        'license_number',
        'address',
        'working_hours_start',
        'working_hours_end',
        'default_appointment_duration',
        'password',
        'role',
        'dentist_owner_id',
        'assistant_permissions',
        'must_change_password',
        'account_status',
        'subscription_plan',
        'subscription_started_at',
        'subscription_ends_at',
        'trial_ends_at',
        'subscription_cancel_at_period_end',
        'subscription_cancelled_at',
        'subscription_payment_method',
        'subscription_payment_amount',
        'subscription_note',
        'last_login_at',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'dentist_owner_id' => 'integer',
            'assistant_permissions' => 'array',
            'must_change_password' => 'boolean',
            'default_appointment_duration' => 'integer',
            'subscription_started_at' => 'datetime',
            'subscription_ends_at' => 'datetime',
            'trial_ends_at' => 'datetime',
            'subscription_cancel_at_period_end' => 'boolean',
            'subscription_cancelled_at' => 'datetime',
            'subscription_payment_amount' => 'decimal:2',
            'last_login_at' => 'datetime',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    public function isDentist(): bool
    {
        return $this->role === self::ROLE_DENTIST;
    }

    public function isAssistant(): bool
    {
        return $this->role === self::ROLE_ASSISTANT;
    }

    public function hasActiveAccount(): bool
    {
        return $this->account_status === self::ACCOUNT_STATUS_ACTIVE;
    }

    public function tenantDentistId(): ?int
    {
        if ($this->isDentist()) {
            return (int) $this->id;
        }

        if ($this->isAssistant()) {
            return $this->dentist_owner_id !== null ? (int) $this->dentist_owner_id : null;
        }

        return null;
    }

    public function subscriptionOwner(): ?self
    {
        if ($this->isDentist()) {
            return $this;
        }

        if ($this->isAssistant()) {
            return $this->ownerDentist;
        }

        return null;
    }

    public function hasConfiguredSubscription(): bool
    {
        return $this->isDentist() && $this->subscription_plan !== null && $this->subscriptionEndsAt() !== null;
    }

    public function subscriptionEndsAt(): ?CarbonInterface
    {
        if ($this->subscription_plan === self::SUBSCRIPTION_PLAN_TRIAL) {
            return $this->trial_ends_at ?? $this->subscription_ends_at;
        }

        return $this->subscription_ends_at;
    }

    public function subscriptionGraceEndsAt(): ?CarbonInterface
    {
        $endsAt = $this->subscriptionEndsAt();

        return $endsAt?->copy()->addDays(self::SUBSCRIPTION_GRACE_DAYS);
    }

    public function subscriptionStatus(): string
    {
        if (! $this->hasConfiguredSubscription()) {
            return self::SUBSCRIPTION_STATUS_NONE;
        }

        if ($this->subscription_cancelled_at !== null && ! $this->subscription_cancel_at_period_end) {
            return self::SUBSCRIPTION_STATUS_READ_ONLY;
        }

        $endsAt = $this->subscriptionEndsAt();
        if ($endsAt === null) {
            return self::SUBSCRIPTION_STATUS_NONE;
        }

        if ($endsAt->greaterThanOrEqualTo(now())) {
            return $this->subscription_plan === self::SUBSCRIPTION_PLAN_TRIAL
                ? self::SUBSCRIPTION_STATUS_TRIALING
                : self::SUBSCRIPTION_STATUS_ACTIVE;
        }

        $graceEndsAt = $this->subscriptionGraceEndsAt();
        if ($graceEndsAt !== null && $graceEndsAt->greaterThanOrEqualTo(now())) {
            return self::SUBSCRIPTION_STATUS_GRACE;
        }

        return self::SUBSCRIPTION_STATUS_READ_ONLY;
    }

    public function subscriptionAccessMode(): string
    {
        return $this->subscriptionStatus() === self::SUBSCRIPTION_STATUS_READ_ONLY
            ? self::SUBSCRIPTION_ACCESS_READ_ONLY
            : self::SUBSCRIPTION_ACCESS_FULL;
    }

    public function usesReadOnlyAccess(): bool
    {
        return $this->subscriptionAccessMode() === self::SUBSCRIPTION_ACCESS_READ_ONLY;
    }

    public function subscriptionStaffLimit(): ?int
    {
        return match ($this->subscription_plan) {
            self::SUBSCRIPTION_PLAN_TRIAL => self::STAFF_LIMIT_TRIAL,
            self::SUBSCRIPTION_PLAN_MONTHLY => self::STAFF_LIMIT_MONTHLY,
            self::SUBSCRIPTION_PLAN_YEARLY => self::STAFF_LIMIT_YEARLY,
            default => null,
        };
    }

    public function activeAssistantsCount(): int
    {
        $preloadedCount = $this->getAttribute('active_assistants_count');
        if (is_numeric($preloadedCount)) {
            return (int) $preloadedCount;
        }

        return $this->assistants()
            ->where('account_status', self::ACCOUNT_STATUS_ACTIVE)
            ->count();
    }

    public function hasAvailableAssistantSlot(): bool
    {
        $staffLimit = $this->subscriptionStaffLimit();

        return $staffLimit === null || $this->activeAssistantsCount() < $staffLimit;
    }

    public function subscriptionDaysRemaining(): ?int
    {
        $endsAt = $this->subscriptionEndsAt();
        if ($endsAt === null) {
            return null;
        }

        return now()->startOfDay()->diffInDays($endsAt->copy()->startOfDay(), false);
    }

    /**
     * @return array<string, mixed>
     */
    public function subscriptionSummary(): array
    {
        $endsAt = $this->subscriptionEndsAt();
        $graceEndsAt = $this->subscriptionGraceEndsAt();
        $status = $this->subscriptionStatus();

        return [
            'is_configured' => $this->hasConfiguredSubscription(),
            'plan' => $this->subscription_plan,
            'status' => $status,
            'access_mode' => $this->subscriptionAccessMode(),
            'starts_at' => $this->subscription_started_at?->toIso8601String(),
            'ends_at' => $endsAt?->toIso8601String(),
            'trial_ends_at' => $this->trial_ends_at?->toIso8601String(),
            'grace_ends_at' => $graceEndsAt?->toIso8601String(),
            'cancel_at_period_end' => (bool) $this->subscription_cancel_at_period_end,
            'cancelled_at' => $this->subscription_cancelled_at?->toIso8601String(),
            'days_remaining' => $this->subscriptionDaysRemaining(),
            'staff_limit' => $this->subscriptionStaffLimit(),
            'active_staff_count' => $this->activeAssistantsCount(),
            'is_read_only' => $status === self::SUBSCRIPTION_STATUS_READ_ONLY,
            'payment_method' => $this->subscription_payment_method,
            'payment_amount' => $this->subscription_payment_amount !== null
                ? (float) $this->subscription_payment_amount
                : null,
            'note' => $this->subscription_note,
        ];
    }

    public function startFreeTrial(?string $note = null): void
    {
        $startedAt = now();

        $this->forceFill([
            'subscription_plan' => self::SUBSCRIPTION_PLAN_TRIAL,
            'subscription_started_at' => $startedAt,
            'subscription_ends_at' => null,
            'trial_ends_at' => $startedAt->copy()->addDays(self::SUBSCRIPTION_TRIAL_DAYS),
            'subscription_cancel_at_period_end' => false,
            'subscription_cancelled_at' => null,
            'subscription_payment_method' => null,
            'subscription_payment_amount' => null,
            'subscription_note' => $note,
        ])->save();
    }

    public function activatePaidSubscription(
        string $plan,
        ?string $paymentMethod = null,
        ?float $paymentAmount = null,
        ?string $note = null,
    ): void {
        $startedAt = now();

        $this->forceFill([
            'subscription_plan' => $plan,
            'subscription_started_at' => $startedAt,
            'subscription_ends_at' => $this->subscriptionEndForPlan($plan, $startedAt),
            'trial_ends_at' => null,
            'subscription_cancel_at_period_end' => false,
            'subscription_cancelled_at' => null,
            'subscription_payment_method' => $paymentMethod,
            'subscription_payment_amount' => $paymentAmount,
            'subscription_note' => $note,
        ])->save();
    }

    public function applyPaidSubscription(
        string $plan,
        ?string $paymentMethod = null,
        ?float $paymentAmount = null,
        ?string $note = null,
    ): void {
        if ($this->shouldExtendPaidSubscription($plan)) {
            $this->extendPaidSubscription($plan, $paymentMethod, $paymentAmount, $note);

            return;
        }

        $this->activatePaidSubscription($plan, $paymentMethod, $paymentAmount, $note);
    }

    public function extendPaidSubscription(
        string $plan,
        ?string $paymentMethod = null,
        ?float $paymentAmount = null,
        ?string $note = null,
    ): void {
        $baseDate = $this->subscriptionEndsAt();
        if ($baseDate === null || $baseDate->lessThan(now())) {
            $baseDate = now();
        }

        $this->forceFill([
            'subscription_plan' => $plan,
            'subscription_started_at' => $this->subscription_started_at ?? now(),
            'subscription_ends_at' => $this->subscriptionEndForPlan($plan, $baseDate),
            'trial_ends_at' => null,
            'subscription_cancel_at_period_end' => false,
            'subscription_cancelled_at' => null,
            'subscription_payment_method' => $paymentMethod,
            'subscription_payment_amount' => $paymentAmount,
            'subscription_note' => $note,
        ])->save();
    }

    private function shouldExtendPaidSubscription(string $plan): bool
    {
        if ($plan !== $this->subscription_plan) {
            return false;
        }

        return in_array($this->subscriptionStatus(), [
            self::SUBSCRIPTION_STATUS_ACTIVE,
            self::SUBSCRIPTION_STATUS_GRACE,
        ], true);
    }

    public function cancelSubscriptionAtPeriodEnd(?string $note = null): void
    {
        $this->forceFill([
            'subscription_cancel_at_period_end' => true,
            'subscription_note' => $note,
        ])->save();
    }

    public function cancelSubscriptionImmediately(?string $note = null): void
    {
        $cancelledAt = now();

        $this->forceFill([
            'subscription_cancel_at_period_end' => false,
            'subscription_cancelled_at' => $cancelledAt,
            'subscription_ends_at' => $this->subscription_plan === self::SUBSCRIPTION_PLAN_TRIAL
                ? $this->subscription_ends_at
                : $cancelledAt,
            'trial_ends_at' => $this->subscription_plan === self::SUBSCRIPTION_PLAN_TRIAL
                ? $cancelledAt
                : $this->trial_ends_at,
            'subscription_note' => $note,
        ])->save();
    }

    private function subscriptionEndForPlan(string $plan, CarbonInterface $startsAt): ?CarbonInterface
    {
        return match ($plan) {
            self::SUBSCRIPTION_PLAN_MONTHLY => $startsAt->copy()->addMonthNoOverflow(),
            self::SUBSCRIPTION_PLAN_YEARLY => $startsAt->copy()->addYearNoOverflow(),
            default => null,
        };
    }

    public function hasPermission(string $permission): bool
    {
        if ($this->isAdmin() || $this->isDentist()) {
            return true;
        }

        if (! $this->isAssistant()) {
            return false;
        }

        /** @var array<int, string> $permissions */
        $permissions = $this->assistant_permissions ?? [];

        // Assistants are intentionally blocked from settings/audit access.
        if (
            $permission === self::PERMISSION_SETTINGS_VIEW
            || $permission === self::PERMISSION_SETTINGS_MANAGE
            || $permission === self::PERMISSION_AUDIT_LOGS_VIEW
        ) {
            return false;
        }

        return in_array($permission, $permissions, true);
    }

    /**
     * @return array<int, string>
     */
    public static function defaultAssistantPermissions(): array
    {
        return [
            self::PERMISSION_PATIENTS_VIEW,
            self::PERMISSION_PATIENTS_MANAGE,
            self::PERMISSION_APPOINTMENTS_VIEW,
            self::PERMISSION_APPOINTMENTS_MANAGE,
            self::PERMISSION_ODONTOGRAM_VIEW,
            self::PERMISSION_ODONTOGRAM_MANAGE,
            self::PERMISSION_TREATMENTS_VIEW,
            self::PERMISSION_TREATMENTS_MANAGE,
            self::PERMISSION_PATIENT_CATEGORIES_VIEW,
            self::PERMISSION_PATIENT_CATEGORIES_MANAGE,
        ];
    }

    /**
     * @return BelongsTo<User, User>
     */
    public function ownerDentist(): BelongsTo
    {
        return $this->belongsTo(self::class, 'dentist_owner_id');
    }

    /**
     * @return HasMany<User, User>
     */
    public function assistants(): HasMany
    {
        return $this->hasMany(self::class, 'dentist_owner_id')
            ->where('role', self::ROLE_ASSISTANT);
    }

    /**
     * @return HasMany<Patient, User>
     */
    public function patients(): HasMany
    {
        return $this->hasMany(Patient::class, 'dentist_id');
    }

    /**
     * @return HasMany<PatientCategory, User>
     */
    public function patientCategories(): HasMany
    {
        return $this->hasMany(PatientCategory::class, 'dentist_id');
    }

    /**
     * @return HasMany<Appointment, User>
     */
    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class, 'dentist_id');
    }

    /**
     * @return HasMany<Invoice, User>
     */
    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'dentist_id');
    }

    /**
     * @return HasMany<Payment, User>
     */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'dentist_id');
    }

    /**
     * @return HasMany<OdontogramEntry, User>
     */
    public function odontogramEntries(): HasMany
    {
        return $this->hasMany(OdontogramEntry::class, 'dentist_id');
    }

    /**
     * @return HasMany<Treatment, User>
     */
    public function treatments(): HasMany
    {
        return $this->hasMany(Treatment::class, 'dentist_id');
    }

    /**
     * @return HasMany<AuditLog, User>
     */
    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class, 'actor_id');
    }
}
