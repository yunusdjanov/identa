<?php

namespace App\Models;

use App\Contracts\TenantOwned;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Appointment extends Model implements TenantOwned
{
    /** @use HasFactory<\Database\Factories\AppointmentFactory> */
    use BelongsToTenant, HasFactory, HasUuids;

    public const STATUS_SCHEDULED = 'scheduled';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_NO_SHOW = 'no_show';

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
        'created_by_user_id',
        'updated_by_user_id',
        'patient_id',
        'guest_name',
        'guest_phone',
        'appointment_date',
        'start_time',
        'end_time',
        'status',
        'notes',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'appointment_date' => 'date',
        ];
    }

    /**
     * @return BelongsTo<User, Appointment>
     */
    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }

    /**
     * @return BelongsTo<User, Appointment>
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /**
     * @return BelongsTo<User, Appointment>
     */
    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_user_id');
    }

    /**
     * @return BelongsTo<Patient, Appointment>
     */
    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * Limit the query to appointments whose patient still exists and is not
     * archived (soft-deleted).
     *
     * When a dentist archives a patient we deliberately keep the appointment
     * rows so a later restore brings the full history back. But until then the
     * appointments must drop out of every active scheduling surface: the
     * calendar list, the dashboard "today" widget, and slot-conflict checks -
     * otherwise they linger as ghost rows whose `patient` relation resolves to
     * null (rendered as "Unknown patient") and keep blocking time slots the
     * dentist can no longer see. Restoring the patient makes them reappear
     * automatically, since nothing was deleted. Guest appointments have no
     * patient row by design, so they stay visible and continue blocking their
     * scheduled slot.
     *
     * @param  Builder<Appointment>  $query
     * @return Builder<Appointment>
     */
    public function scopeForActivePatients(Builder $query): Builder
    {
        return $query->where(function (Builder $builder): void {
            $builder->whereNull('patient_id')
                ->orWhereExists(function ($subQuery): void {
                    $subQuery->selectRaw('1')
                        ->from('patients')
                        ->whereColumn('patients.id', 'appointments.patient_id')
                        ->whereColumn('patients.dentist_id', 'appointments.dentist_id')
                        ->whereNull('patients.deleted_at');
                });
        });
    }
}
