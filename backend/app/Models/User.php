<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Carbon\CarbonInterface;
use App\Notifications\VerifyEmailNotification;
use App\Services\SubscriptionService;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
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
    public const STAFF_PERMISSIONS = [
        self::PERMISSION_PATIENTS_VIEW,
        self::PERMISSION_PATIENTS_MANAGE,
        self::PERMISSION_APPOINTMENTS_VIEW,
        self::PERMISSION_APPOINTMENTS_MANAGE,
        self::PERMISSION_PAYMENTS_VIEW,
        self::PERMISSION_PAYMENTS_MANAGE,
    ];
    public const STAFF_MANAGE_VIEW_DEPENDENCIES = [
        self::PERMISSION_PATIENTS_MANAGE => self::PERMISSION_PATIENTS_VIEW,
        self::PERMISSION_APPOINTMENTS_MANAGE => self::PERMISSION_APPOINTMENTS_VIEW,
        self::PERMISSION_PAYMENTS_MANAGE => self::PERMISSION_PAYMENTS_VIEW,
    ];

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
        'provider',
        'google_id',
        'avatar_url',
        'role',
        'dentist_owner_id',
        'assistant_permissions',
        'must_change_password',
        'show_record_authors',
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
        'google_id',
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
            'show_record_authors' => 'boolean',
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

    /**
     * Override Laravel's default English Markdown verification mailer with
     * the branded, localized notification under App\Notifications. The
     * locale is captured inside the notification's constructor from the
     * current request — keep this trigger synchronous (no queue) so the
     * request-bound `App::getLocale()` is still authoritative.
     */
    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VerifyEmailNotification());
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

    /**
     * Whether this account may currently access the app. An assistant inherits
     * access from its owning dentist, so blocking/deleting a dentist must also
     * revoke every assistant — including sessions established earlier or
     * recovered via a "remember me" cookie (which bypasses the login service).
     * Re-checking the owner here keeps revocation instant and reversible
     * without mutating each assistant's own status.
     */
    public function hasActiveAccessChain(): bool
    {
        if (! $this->hasActiveAccount()) {
            return false;
        }

        if ($this->isAssistant()) {
            $owner = $this->ownerDentist;

            return $owner !== null && $owner->hasActiveAccount();
        }

        return true;
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

    public function subscriptionEndsAt(): ?CarbonInterface
    {
        return app(SubscriptionService::class)->currentForOwner($this)?->ends_at;
    }

    public function subscriptionStatus(): string
    {
        return (string) app(SubscriptionService::class)->summary($this)['status'];
    }

    public function subscriptionAccessMode(): string
    {
        return $this->subscriptionStatus() === self::SUBSCRIPTION_STATUS_READ_ONLY
            ? self::SUBSCRIPTION_ACCESS_READ_ONLY
            : self::SUBSCRIPTION_ACCESS_FULL;
    }

    public function usesReadOnlyAccess(): bool
    {
        return app(SubscriptionService::class)->isReadOnly($this);
    }

    public function subscriptionStaffLimit(): ?int
    {
        return app(SubscriptionService::class)->staffLimit($this);
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
        return app(SubscriptionService::class)->summary($this);
    }

    public function startFreeTrial(?string $note = null): void
    {
        app(SubscriptionService::class)->ensureTrial($this, $note);
    }

    public function activatePaidSubscription(
        string $plan,
        ?string $paymentMethod = null,
        ?float $paymentAmount = null,
        ?string $note = null,
    ): void {
        $planModel = Plan::query()
            ->where('code', $plan === self::SUBSCRIPTION_PLAN_YEARLY ? Plan::CODE_PRO : Plan::CODE_BASIC)
            ->firstOrFail();

        app(SubscriptionService::class)->activatePaid(
            owner: $this,
            plan: $planModel,
            billingPeriod: $plan === self::SUBSCRIPTION_PLAN_YEARLY ? Subscription::PERIOD_YEARLY : Subscription::PERIOD_MONTHLY,
            paymentMethod: $paymentMethod,
            paymentAmount: $paymentAmount,
            note: $note,
        );
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

    /**
     * Extend the current paid subscription by one period. Routes through
     * SubscriptionService::renewOrActivate so the Subscription row, legacy
     * User columns and staff limits stay in sync under a single transaction
     * + row lock. Previously this method wrote only to the User legacy
     * columns, leaving the canonical Subscription row stale.
     */
    public function extendPaidSubscription(
        string $plan,
        ?string $paymentMethod = null,
        ?float $paymentAmount = null,
        ?string $note = null,
    ): void {
        $planModel = Plan::query()
            ->where('code', $plan === self::SUBSCRIPTION_PLAN_YEARLY ? Plan::CODE_PRO : Plan::CODE_BASIC)
            ->firstOrFail();

        app(SubscriptionService::class)->renewOrActivate(
            owner: $this,
            plan: $planModel,
            billingPeriod: $plan === self::SUBSCRIPTION_PLAN_YEARLY ? Subscription::PERIOD_YEARLY : Subscription::PERIOD_MONTHLY,
            paymentMethod: $paymentMethod,
            paymentAmount: $paymentAmount,
            note: $note,
        );
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

    /**
     * Schedule cancellation at the end of the current paid period. Routes
     * through SubscriptionService so the subscription row + legacy columns
     * are updated atomically under a row lock. Previously the two writes
     * happened independently and were vulnerable to a webhook race.
     */
    public function cancelSubscriptionAtPeriodEnd(?string $note = null): void
    {
        app(SubscriptionService::class)->cancelAtPeriodEnd($this, $note);
    }

    /**
     * Cancel the subscription immediately, dropping access to read-only.
     * Routes through SubscriptionService for the same race-safety reason
     * as cancelSubscriptionAtPeriodEnd().
     */
    public function cancelSubscriptionImmediately(?string $note = null): void
    {
        app(SubscriptionService::class)->cancelImmediately($this, $note);
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

        $permissions = self::normalizeAssistantPermissions($this->assistant_permissions ?? []);

        // Staff can edit their own profile through a dedicated route, but not shared settings or audit logs.
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
        return self::STAFF_PERMISSIONS;
    }

    /**
     * @return array<int, string>
     */
    public static function allowedAssistantPermissions(): array
    {
        return self::STAFF_PERMISSIONS;
    }

    /**
     * @param  array<int, mixed>|null  $permissions
     * @return array<int, string>
     */
    public static function normalizeAssistantPermissions(?array $permissions): array
    {
        if ($permissions === null) {
            return [];
        }

        $permissionSet = [];
        foreach ($permissions as $permission) {
            if (! is_string($permission) || ! in_array($permission, self::STAFF_PERMISSIONS, true)) {
                continue;
            }

            $permissionSet[$permission] = true;
            $viewPermission = self::STAFF_MANAGE_VIEW_DEPENDENCIES[$permission] ?? null;
            if ($viewPermission !== null) {
                $permissionSet[$viewPermission] = true;
            }
        }

        foreach (self::STAFF_MANAGE_VIEW_DEPENDENCIES as $managePermission => $viewPermission) {
            if (! isset($permissionSet[$viewPermission])) {
                unset($permissionSet[$managePermission]);
            }
        }

        return array_values(array_filter(
            self::STAFF_PERMISSIONS,
            static fn (string $permission): bool => isset($permissionSet[$permission])
        ));
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
     * @return HasMany<PaymentExpense, User>
     */
    public function paymentExpenses(): HasMany
    {
        return $this->hasMany(PaymentExpense::class, 'dentist_id');
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

    /**
     * @return HasMany<Subscription, User>
     */
    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    /**
     * @return HasMany<BillingPayment, User>
     */
    public function billingPayments(): HasMany
    {
        return $this->hasMany(BillingPayment::class);
    }
}
