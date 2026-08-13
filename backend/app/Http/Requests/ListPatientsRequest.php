<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class ListPatientsRequest extends FormRequest
{
    private const MAX_CATEGORY_FILTERS = 50;

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
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'sort' => ['sometimes', 'string', 'max:160'],
            'filter' => ['sometimes', 'array'],
            'filter.search' => ['sometimes', 'nullable', 'string', 'max:160'],
            'filter.id' => ['sometimes', 'nullable', 'uuid'],
            'filter.category_id' => ['sometimes', 'nullable', 'uuid'],
            'filter.category_ids' => [
                'sometimes',
                'nullable',
                function (string $attribute, mixed $value, Closure $fail): void {
                    $ids = is_array($value)
                        ? $value
                        : (is_string($value) ? array_map('trim', explode(',', $value)) : null);

                    if ($ids === null || count($ids) > self::MAX_CATEGORY_FILTERS) {
                        $fail(__('validation.array', ['attribute' => $attribute]));

                        return;
                    }

                    foreach ($ids as $id) {
                        if (! is_string($id) || ! Str::isUuid($id)) {
                            $fail(__('validation.uuid', ['attribute' => $attribute]));

                            return;
                        }
                    }
                },
            ],
            'filter.inactive_before' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'filter.archived_only' => ['sometimes', 'nullable', 'in:0,1,true,false,yes,no,on,off'],
            'filter.include_archived' => ['sometimes', 'nullable', 'in:0,1,true,false,yes,no,on,off'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $filter = $this->input('filter');
        if (! is_array($filter) || ! is_string($filter['search'] ?? null)) {
            return;
        }

        $filter['search'] = trim($filter['search']);
        $this->merge(['filter' => $filter]);
    }
}
