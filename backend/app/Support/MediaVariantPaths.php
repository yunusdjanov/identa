<?php

namespace App\Support;

use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\PatientClinicalPhoto;
use App\Models\TreatmentImage;
use Illuminate\Database\Eloquent\Model;

class MediaVariantPaths
{
    private const IMAGE_VARIANT_THUMBNAIL = 'thumbnail';

    private const IMAGE_VARIANT_PREVIEW = 'preview';

    private const PATIENT_THUMBNAIL_MAX_EDGE = 160;

    private const PATIENT_PREVIEW_MAX_EDGE = 960;

    private const TREATMENT_THUMBNAIL_MAX_EDGE = 200;

    private const TREATMENT_PREVIEW_MAX_EDGE = 1280;

    private const CLINICAL_PHOTO_THUMBNAIL_MAX_EDGE = 200;

    private const CLINICAL_PHOTO_PREVIEW_MAX_EDGE = 1280;

    /**
     * Build image variant job definitions for the media record type.
     *
     * @return array<string, array{path: string, max_edge: int}>
     */
    public static function definitions(Model $record, string $path): array
    {
        $variants = [];

        foreach (self::variantMaxEdges($record) as $variant => $maxEdge) {
            $variants[$variant] = [
                'path' => self::variantPath($path, $variant),
                'max_edge' => $maxEdge,
            ];
        }

        return $variants;
    }

    /**
     * Build all storage paths that should be deleted with the source object.
     *
     * @return list<string>
     */
    public static function deletePaths(Model $record, string $path): array
    {
        return array_merge(
            [$path],
            array_map(
                static fn (array $variant): string => $variant['path'],
                self::definitions($record, $path)
            )
        );
    }

    /**
     * Return a human-readable media label for logs and queued cleanup jobs.
     */
    public static function logContext(Model $record): string
    {
        return match (true) {
            $record instanceof Patient => 'Patient photo',
            $record instanceof PatientClinicalPhoto => 'Patient clinical photo',
            $record instanceof TreatmentImage => 'Treatment image',
            $record instanceof OdontogramEntryImage => 'Odontogram image',
            default => 'Stored media',
        };
    }

    /**
     * @return array<string, int>
     */
    private static function variantMaxEdges(Model $record): array
    {
        if ($record instanceof TreatmentImage) {
            return [
                self::IMAGE_VARIANT_THUMBNAIL => self::TREATMENT_THUMBNAIL_MAX_EDGE,
                self::IMAGE_VARIANT_PREVIEW => self::TREATMENT_PREVIEW_MAX_EDGE,
            ];
        }

        if ($record instanceof PatientClinicalPhoto) {
            return [
                self::IMAGE_VARIANT_THUMBNAIL => self::CLINICAL_PHOTO_THUMBNAIL_MAX_EDGE,
                self::IMAGE_VARIANT_PREVIEW => self::CLINICAL_PHOTO_PREVIEW_MAX_EDGE,
            ];
        }

        if ($record instanceof Patient || $record instanceof OdontogramEntryImage) {
            return [
                self::IMAGE_VARIANT_THUMBNAIL => self::PATIENT_THUMBNAIL_MAX_EDGE,
                self::IMAGE_VARIANT_PREVIEW => self::PATIENT_PREVIEW_MAX_EDGE,
            ];
        }

        return [];
    }

    private static function variantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }
}
