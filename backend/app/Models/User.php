<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
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
            self::PERMISSION_INVOICES_VIEW,
            self::PERMISSION_INVOICES_MANAGE,
            self::PERMISSION_PAYMENTS_VIEW,
            self::PERMISSION_PAYMENTS_MANAGE,
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
