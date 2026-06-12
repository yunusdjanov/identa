<?php

namespace App\Http\Resources;

use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OdontogramImageResource extends JsonResource
{
    /**
     * @param  callable(OdontogramEntry, OdontogramEntryImage, string|null): ?string  $urlResolver
     * @param  callable(OdontogramEntryImage, string): bool  $variantReadyResolver
     */
    public function __construct(
        OdontogramEntryImage $resource,
        private readonly OdontogramEntry $entry,
        private readonly mixed $urlResolver,
        private readonly mixed $variantReadyResolver
    ) {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var OdontogramEntryImage $image */
        $image = $this->resource;
        $isApproved = (string) $image->scan_status === 'approved'
            || (
                trim((string) $image->path) !== ''
                && trim((string) $image->quarantine_path) !== ''
                && trim((string) $image->path) !== trim((string) $image->quarantine_path)
            );

        return [
            'id' => (string) $image->id,
            'stage' => $image->stage,
            'mime_type' => $image->mime_type,
            'file_size' => (int) $image->file_size,
            'scan_status' => $isApproved ? 'approved' : (string) ($image->scan_status ?? 'approved'),
            'captured_at' => $image->captured_at?->toDateString(),
            'created_at' => $image->created_at?->toIso8601String(),
            'url' => $isApproved
                ? ($this->urlResolver)($this->entry, $image, null)
                : null,
            'thumbnail_url' => $isApproved
                ? ($this->urlResolver)($this->entry, $image, 'thumbnail')
                : null,
            'preview_url' => $isApproved
                ? ($this->urlResolver)($this->entry, $image, 'preview')
                : null,
            'thumbnail_ready' => $isApproved
                && ($this->variantReadyResolver)($image, 'thumbnail'),
            'preview_ready' => $isApproved
                && ($this->variantReadyResolver)($image, 'preview'),
        ];
    }
}
