<?php

namespace App\Services;

use App\Models\User;
use App\Support\MediaUploadLimits;
use Illuminate\Http\Exceptions\HttpResponseException;
use Symfony\Component\HttpFoundation\Response;

class PlanLimitService
{
    private const ALLOWED_IMAGE_MIME_TYPES = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
    ];

    public function __construct(
        private readonly SubscriptionService $subscriptionService,
    ) {
    }

    public function ensureStaffSlotAvailable(User $owner): void
    {
        $limit = $this->subscriptionService->staffLimit($owner);
        if ($limit === null || $owner->activeAssistantsCount() < $limit) {
            return;
        }

        $this->deny(
            code: 'plan_staff_limit_reached',
            message: __('api.subscription.assistant_limit_reached', ['limit' => $limit]),
            meta: ['limit' => $limit]
        );
    }

    public function ensureEntryImageUploadAllowed(User $owner, int $currentCount, int $incomingCount = 1): void
    {
        $limit = $this->subscriptionService->entryImageLimit($owner);
        if ($limit === null || $currentCount + $incomingCount <= $limit) {
            return;
        }

        $this->deny(
            code: 'plan_entry_image_limit_reached',
            message: __('api.subscription.entry_image_limit_reached', ['limit' => $limit]),
            meta: ['limit' => $limit]
        );
    }

    public function entryImageLimit(User $owner): ?int
    {
        return $this->subscriptionService->entryImageLimit($owner);
    }

    public function availableEntryImageSlots(User $owner, int $currentCount): ?int
    {
        $limit = $this->entryImageLimit($owner);

        return $limit === null ? null : max(0, $limit - $currentCount);
    }

    public function ensureUploadFileAllowed(User $owner, int $fileSize, ?string $mimeType): void
    {
        $normalizedMimeType = strtolower(trim((string) $mimeType));
        if (! in_array($normalizedMimeType, self::ALLOWED_IMAGE_MIME_TYPES, true)) {
            $this->deny(
                code: 'plan_upload_size_exceeded',
                message: __('api.subscription.image_type_not_allowed')
            );
        }

        $platformLimit = MediaUploadLimits::maxBytes();
        if ($fileSize > $platformLimit) {
            $this->deny(
                code: 'upload_size_exceeded',
                message: __('api.subscription.upload_size_exceeded', ['limit' => $this->formatBytesAsMb($platformLimit)]),
                meta: ['limit_bytes' => $platformLimit]
            );
        }

        $limit = $this->subscriptionService->uploadMaxBytes($owner);
        if ($limit === null || $fileSize <= $limit) {
            return;
        }

        $this->deny(
            code: 'plan_upload_size_exceeded',
            message: __('api.subscription.upload_size_exceeded', ['limit' => $this->formatBytesAsMb($limit)]),
            meta: ['limit_bytes' => $limit]
        );
    }

    public function ensureStoredFileAllowed(User $owner, int $fileSize): void
    {
        $limit = $this->subscriptionService->storedImageMaxBytes($owner);
        if ($limit === null || $fileSize <= $limit) {
            return;
        }

        $this->deny(
            code: 'plan_upload_size_exceeded',
            message: __('api.subscription.stored_image_size_exceeded', ['limit' => $this->formatBytesAsMb($limit)]),
            meta: ['limit_bytes' => $limit]
        );
    }

    public function storedImageMaxBytes(User $owner): ?int
    {
        return $this->subscriptionService->storedImageMaxBytes($owner);
    }

    public function ensureExportAvailable(User $owner): void
    {
        if ($this->subscriptionService->canExport($owner)) {
            return;
        }

        $this->deny(
            code: 'plan_feature_not_available',
            message: __('api.subscription.feature_not_available')
        );
    }

    private function formatBytesAsMb(int $bytes): string
    {
        $megabytes = $bytes / 1024 / 1024;

        return rtrim(rtrim(number_format($megabytes, 2, '.', ''), '0'), '.');
    }

    /**
     * @param array<string, mixed> $meta
     */
    private function deny(string $code, string $message, array $meta = []): never
    {
        throw new HttpResponseException(response()->json([
            'error' => [
                'code' => $code,
                'message' => $message,
                'meta' => $meta,
            ],
        ], Response::HTTP_FORBIDDEN));
    }
}
