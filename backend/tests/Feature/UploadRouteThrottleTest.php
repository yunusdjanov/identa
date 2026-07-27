<?php

namespace Tests\Feature;

use Illuminate\Routing\Route as IlluminateRoute;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class UploadRouteThrottleTest extends TestCase
{
    public function test_media_upload_mutations_have_strict_upload_throttle(): void
    {
        foreach ($this->mediaUploadRoutes() as $uri) {
            $middleware = $this->postRoute($uri)->gatherMiddleware();

            $this->assertContains('throttle:60,1', $middleware, "{$uri} is missing the media upload throttle");
        }
    }

    private function postRoute(string $uri): IlluminateRoute
    {
        foreach (Route::getRoutes() as $route) {
            if ($route->uri() === $uri && in_array('POST', $route->methods(), true)) {
                return $route;
            }
        }

        $this->fail("POST {$uri} route was not registered");
    }

    /**
     * @return list<string>
     */
    private function mediaUploadRoutes(): array
    {
        return [
            'api/v1/patients/{id}/photo/direct-upload',
            'api/v1/patients/{id}/photo/direct-upload/{uploadId}/complete',
            'api/v1/patients/{id}/photo',
            'api/v1/patients/{id}/oral-photo/direct-upload',
            'api/v1/patients/{id}/oral-photo/direct-upload/{uploadId}/complete',
            'api/v1/patients/{id}/oral-photo',
            'api/v1/patients/{id}/oral-photos/{viewType}/direct-upload',
            'api/v1/patients/{id}/oral-photos/{viewType}/direct-upload/{uploadId}/complete',
            'api/v1/patients/{id}/oral-photos/{viewType}',
            'api/v1/patients/{id}/oral-photos/{viewType}/{photoId}/replace',
            'api/v1/patients/{id}/treatments/{treatmentId}/images/direct-upload',
            'api/v1/patients/{id}/treatments/{treatmentId}/images/direct-upload/{uploadId}/complete',
            'api/v1/patients/{id}/treatments/{treatmentId}/images/direct-upload-batch',
            'api/v1/patients/{id}/treatments/{treatmentId}/images/direct-upload-batch/complete',
            'api/v1/patients/{id}/treatments/{treatmentId}/images',
            'api/v1/patients/{id}/treatments/{treatmentId}/images/{imageId}/replace',
        ];
    }
}
