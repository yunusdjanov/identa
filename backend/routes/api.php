<?php

use App\Http\Controllers\Api\Admin\DentistAccountController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\PatientCategoryController;
use App\Http\Controllers\Api\PatientOdontogramController;
use App\Http\Controllers\Api\PatientTreatmentController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\SettingsProfileController;
use App\Http\Controllers\Api\TeamAssistantController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('/health', function () {
        return response()->json([
            'status' => 'ok',
            'service' => 'backend',
            'timestamp' => now()->toIso8601String(),
        ]);
    });

    Route::prefix('auth')->middleware('web')->group(function (): void {
        Route::get('/csrf-token', function (Request $request) {
            $request->session()->regenerateToken();

            return response()->json([
                'token' => $request->session()->token(),
            ]);
        })->middleware('throttle:30,1');

        Route::post('/register', [AuthController::class, 'register'])
            ->middleware('throttle:10,1');
        Route::post('/login', [AuthController::class, 'login'])
            ->middleware('throttle:5,1');
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])
            ->middleware('throttle:5,1');
        Route::post('/reset-password', [AuthController::class, 'resetPassword'])
            ->middleware('throttle:5,1');

        Route::middleware('auth:sanctum')->group(function (): void {
            Route::get('/me', [AuthController::class, 'me']);
            Route::post('/logout', [AuthController::class, 'logout'])
                ->middleware('throttle:15,1');
            Route::post('/change-password', [AuthController::class, 'changePassword'])
                ->middleware('throttle:10,1');
        });
    });

    Route::prefix('admin')
        ->middleware(['auth:sanctum', 'role:admin'])
        ->group(function (): void {
            Route::get('/dentists', [DentistAccountController::class, 'index']);
            Route::post('/dentists', [DentistAccountController::class, 'store']);
            Route::patch('/dentists/{id}/status', [DentistAccountController::class, 'updateStatus']);
            Route::post('/dentists/{id}/reset-password', [DentistAccountController::class, 'resetPassword']);
            Route::delete('/dentists/{id}', [DentistAccountController::class, 'destroy']);
        });

    Route::middleware(['auth:sanctum', 'role:dentist,assistant'])->group(function (): void {
        Route::get('patient-categories', [PatientCategoryController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_PATIENT_CATEGORIES_VIEW);
        Route::post('patient-categories', [PatientCategoryController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PATIENT_CATEGORIES_MANAGE);
        Route::put('patient-categories/{id}', [PatientCategoryController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_PATIENT_CATEGORIES_MANAGE);
        Route::delete('patient-categories/{id}', [PatientCategoryController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_PATIENT_CATEGORIES_MANAGE);

        Route::get('patients', [PatientController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::post('patients', [PatientController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::get('patients/{id}', [PatientController::class, 'show'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::get('patients/{id}/photo', [PatientController::class, 'downloadPhoto'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::post('patients/{id}/photo', [PatientController::class, 'uploadPhoto'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::delete('patients/{id}/photo', [PatientController::class, 'deletePhoto'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::put('patients/{id}', [PatientController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::delete('patients/{id}', [PatientController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::post('patients/{id}/restore', [PatientController::class, 'restore'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::delete('patients/{id}/force', [PatientController::class, 'forceDestroy'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);

        Route::get('patients/{id}/odontogram/summary', [PatientOdontogramController::class, 'summary'])
            ->middleware('permission:'.User::PERMISSION_ODONTOGRAM_VIEW);
        Route::get('patients/{id}/odontogram', [PatientOdontogramController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_ODONTOGRAM_VIEW);
        Route::post('patients/{id}/odontogram', [PatientOdontogramController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_ODONTOGRAM_MANAGE);
        Route::put('patients/{id}/odontogram/{entryId}', [PatientOdontogramController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_ODONTOGRAM_MANAGE);
        Route::delete('patients/{id}/odontogram/{entryId}', [PatientOdontogramController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_ODONTOGRAM_MANAGE);
        Route::post('patients/{id}/odontogram/{entryId}/images', [PatientOdontogramController::class, 'uploadImage'])
            ->middleware('permission:'.User::PERMISSION_ODONTOGRAM_MANAGE);
        Route::get('patients/{id}/odontogram/{entryId}/images/{imageId}', [PatientOdontogramController::class, 'downloadImage'])
            ->middleware('permission:'.User::PERMISSION_ODONTOGRAM_VIEW);
        Route::delete('patients/{id}/odontogram/{entryId}/images/{imageId}', [PatientOdontogramController::class, 'deleteImage'])
            ->middleware('permission:'.User::PERMISSION_ODONTOGRAM_MANAGE);

        Route::get('patients/{id}/treatments', [PatientTreatmentController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_TREATMENTS_VIEW);
        Route::get('treatments', [PatientTreatmentController::class, 'indexAll'])
            ->middleware('permission:'.User::PERMISSION_TREATMENTS_VIEW);
        Route::post('patients/{id}/treatments', [PatientTreatmentController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_TREATMENTS_MANAGE);
        Route::put('patients/{id}/treatments/{treatmentId}', [PatientTreatmentController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_TREATMENTS_MANAGE);
        Route::delete('patients/{id}/treatments/{treatmentId}', [PatientTreatmentController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_TREATMENTS_MANAGE);
        Route::post('patients/{id}/treatments/{treatmentId}/images', [PatientTreatmentController::class, 'uploadImage'])
            ->middleware('permission:'.User::PERMISSION_TREATMENTS_MANAGE);
        Route::get('patients/{id}/treatments/{treatmentId}/images/{imageId}', [PatientTreatmentController::class, 'downloadImage'])
            ->middleware('permission:'.User::PERMISSION_TREATMENTS_VIEW);
        Route::delete('patients/{id}/treatments/{treatmentId}/images/{imageId}', [PatientTreatmentController::class, 'deleteImage'])
            ->middleware('permission:'.User::PERMISSION_TREATMENTS_MANAGE);

        Route::get('appointments', [AppointmentController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_VIEW);
        Route::post('appointments', [AppointmentController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_MANAGE);
        Route::get('appointments/{id}', [AppointmentController::class, 'show'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_VIEW);
        Route::put('appointments/{id}', [AppointmentController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_MANAGE);
        Route::delete('appointments/{id}', [AppointmentController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_MANAGE);

        Route::get('invoices/{id}/download', [InvoiceController::class, 'download'])
            ->middleware('permission:'.User::PERMISSION_INVOICES_VIEW);
        Route::get('invoices', [InvoiceController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_INVOICES_VIEW);
        Route::post('invoices', [InvoiceController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_INVOICES_MANAGE);
        Route::get('invoices/{id}', [InvoiceController::class, 'show'])
            ->middleware('permission:'.User::PERMISSION_INVOICES_VIEW);
        Route::put('invoices/{id}', [InvoiceController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_INVOICES_MANAGE);
        Route::delete('invoices/{id}', [InvoiceController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_INVOICES_MANAGE);

        Route::get('payments', [PaymentController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_VIEW);
        Route::post('payments', [PaymentController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);
        Route::put('payments/{id}', [PaymentController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);
        Route::delete('payments/{id}', [PaymentController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);

        Route::get('settings/profile', [SettingsProfileController::class, 'show'])
            ->middleware('permission:'.User::PERMISSION_SETTINGS_VIEW);
        Route::put('settings/profile', [SettingsProfileController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_SETTINGS_MANAGE);

        Route::get('audit-logs', [AuditLogController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_AUDIT_LOGS_VIEW);
    });

    Route::middleware(['auth:sanctum', 'role:dentist'])->group(function (): void {
        Route::get('team/assistants', [TeamAssistantController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_TEAM_MANAGE);
        Route::post('team/assistants', [TeamAssistantController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_TEAM_MANAGE);
        Route::put('team/assistants/{id}', [TeamAssistantController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_TEAM_MANAGE);
        Route::patch('team/assistants/{id}/status', [TeamAssistantController::class, 'updateStatus'])
            ->middleware('permission:'.User::PERMISSION_TEAM_MANAGE);
        Route::post('team/assistants/{id}/reset-password', [TeamAssistantController::class, 'resetPassword'])
            ->middleware('permission:'.User::PERMISSION_TEAM_MANAGE);
        Route::delete('team/assistants/{id}', [TeamAssistantController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_TEAM_MANAGE);
    });
});
