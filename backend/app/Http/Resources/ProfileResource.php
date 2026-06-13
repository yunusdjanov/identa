<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProfileResource extends JsonResource
{
    public function __construct(User $resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $this->resource;

        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'practice_name' => $user->practice_name,
            'license_number' => $user->license_number,
            'address' => $user->address,
            'working_hours' => [
                'start' => $user->working_hours_start ? substr($user->working_hours_start, 0, 5) : null,
                'end' => $user->working_hours_end ? substr($user->working_hours_end, 0, 5) : null,
            ],
            'default_appointment_duration' => $user->default_appointment_duration,
            'show_record_authors' => (bool) $user->show_record_authors,
        ];
    }
}
