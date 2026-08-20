<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

class ListTreatmentsRequest extends FormRequest
{
    /** @var list<string> */
    public const ALLOWED_SORT_FIELDS = [
        'treatment_date',
        'created_at',
        'cost',
        'tooth_number',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1', 'max:1000000'],
            // Preserve the established export/mobile contract. Browser history
            // uses 10 rows; explicit export callers may request up to 500.
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:500'],
            'include_images' => ['sometimes', 'boolean'],
            'include_summary' => ['sometimes', 'boolean'],
            'sort' => [
                'sometimes',
                'string',
                'max:160',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value) || trim($value) === '') {
                        $fail('The sort field is invalid.');

                        return;
                    }

                    $segments = array_values(array_filter(array_map('trim', explode(',', $value))));
                    if ($segments === [] || count($segments) > count(self::ALLOWED_SORT_FIELDS)) {
                        $fail('The sort field is invalid.');

                        return;
                    }

                    /** @var User|null $viewer */
                    $viewer = $this->user();
                    $canViewFinancials = $viewer instanceof User
                        && $viewer->hasPermission(User::PERMISSION_PAYMENTS_VIEW);

                    foreach ($segments as $segment) {
                        if (! preg_match('/^-?[a-z_]+$/', $segment)) {
                            $fail('The sort field is invalid.');

                            return;
                        }

                        $field = ltrim($segment, '-');
                        if (! in_array($field, self::ALLOWED_SORT_FIELDS, true)) {
                            $fail('The sort field is invalid.');

                            return;
                        }

                        // Sorting a scrubbed treatment list by cost leaks the
                        // relative value of records to a clinical-only viewer.
                        if ($field === 'cost' && ! $canViewFinancials) {
                            $fail('The sort field is invalid.');

                            return;
                        }
                    }
                },
            ],
        ];
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];

        foreach (['include_images', 'include_summary'] as $field) {
            if (! $this->query->has($field)) {
                continue;
            }

            $normalized[$field] = $this->normalizeBoolean($this->query($field));
        }

        if ($this->query->has('sort') && is_string($this->query('sort'))) {
            $normalized['sort'] = trim((string) $this->query('sort'));
        }

        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }

    private function normalizeBoolean(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        return match (strtolower(trim($value))) {
            '1', 'true', 'yes', 'on' => true,
            '0', 'false', 'no', 'off' => false,
            default => $value,
        };
    }
}
