<?php

namespace App\Http\Resources;

use App\Models\PatientCategory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PatientCategoryResource extends JsonResource
{
    public function __construct(PatientCategory $resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, int|string>
     */
    public function toArray(Request $request): array
    {
        /** @var PatientCategory $category */
        $category = $this->resource;

        return [
            'id' => (string) $category->id,
            'name' => $category->name,
            'color' => $category->color,
            'sort_order' => (int) $category->sort_order,
        ];
    }
}
