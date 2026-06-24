<?php

use App\Http\Controllers\Api\Admin\AdminPaymentController;
use App\Http\Controllers\Api\Admin\DentistAccountController;
use App\Http\Controllers\Api\Admin\PlanController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\LandingController;
use App\Http\Controllers\Api\PatientCategoryController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\PatientOdontogramController;
use App\Http\Controllers\Api\PatientTreatmentController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PaymentLedgerController;
use App\Http\Controllers\Api\QuickPaymentController;
use App\Http\Controllers\Api\SettingsProfileController;
use App\Http\Controllers\Api\TeamAssistantController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

defined('MEDIA_UPLOAD_THROTTLE') || define('MEDIA_UPLOAD_THROTTLE', 'throttle:60,1');

Route::prefix('v1')->group(function (): void {
    Route::get('/health', function () {
        return response()->json([
            'status' => 'ok',
            'service' => 'backend',
            'timestamp' => now()->toIso8601String(),
        ]);
    });

    // Public marketing-landing data (no auth) — keeps the landing pricing in
    // sync with the DB plans configured in /admin/plans.
    Route::get('/landing/plans', [LandingController::class, 'plans'])
        ->middleware('throttle:60,1');

    Route::post('/auth/refresh', [AuthController::class, 'refresh'])
        ->middleware('throttle:10,1');

    Route::prefix('auth')->middleware('web')->group(function (): void {
        Route::get('/csrf-token', function (Request $request) {
            $request->session()->regenerateToken();

            return response()->json([
                'token' => $request->session()->token(),
            ]);
        })->middleware('throttle:30,1');

        Route::post('/login', [AuthController::class, 'login'])
            ->middleware('throttle:20,1');
        Route::post('/register', [AuthController::class, 'register'])
            ->middleware('throttle:5,1');
        Route::post('/google', [AuthController::class, 'google'])
            ->middleware('throttle:10,1');
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])
            ->middleware('throttle:5,1');
        Route::post('/reset-password', [AuthController::class, 'resetPassword'])
            ->middleware('throttle:5,1');

        // Signed link from the verification email (auth is the signature itself).
        Route::get('/email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])
            ->middleware(['signed', 'throttle:6,1'])
            ->name('verification.verify');

        Route::middleware('auth:sanctum')->group(function (): void {
            // /auth/me is the most-polled endpoint (every focus refetch,
            // every tab open, every BroadcastChannel sync). Per-user
            // throttle keeps a runaway client / session-enumeration loop
            // from amplifying load. 120 req/min is well above the natural
            // refresh cadence (every 30s = 2 req/min).
            Route::get('/me', [AuthController::class, 'me'])
                ->middleware('throttle:120,1');
            // Named routes so EnsurePasswordRotated can match by name
            // instead of hardcoded paths — if the URI is ever changed
            // (api prefix bump, route rename) the middleware's
            // allow-list keeps working.
            Route::post('/logout', [AuthController::class, 'logout'])
                ->middleware('throttle:15,1')
                ->name('auth.logout');
            Route::post('/change-password', [AuthController::class, 'changePassword'])
                ->middleware('throttle:10,1')
                ->name('auth.change-password');
            Route::post('/email/verification-notification', [AuthController::class, 'resendEmailVerification'])
                ->middleware('throttle:6,1')
                ->name('verification.send');
            // Connected Accounts (Settings → Security). Linking is the
            // authenticated counterpart to the public /auth/google flow
            // (which hard-rejects unknown linkages). Unlinking refuses if
            // there's no password fallback. Both are throttled to keep
            // the auth surface predictable.
            Route::post('/google/link', [AuthController::class, 'linkGoogle'])
                ->middleware('throttle:10,1')
                ->name('auth.google-link');
            Route::delete('/google/link', [AuthController::class, 'unlinkGoogle'])
                ->middleware('throttle:10,1')
                ->name('auth.google-unlink');
        });
    });

    Route::prefix('admin')
        // 120 admin requests/min is generous for normal browsing (a dashboard
        // refresh hits ~5–8 endpoints) but caps the burst that an unauthed
        // search-injection or a compromised admin session could throw at the
        // expensive `LIKE '%...%'` query path.
        // `password.fresh` mirrors the dentist/assistant groups below — an
        // admin whose own password was force-reset must rotate it before
        // they can issue further admin mutations. Reads are unaffected.
        ->middleware(['auth:sanctum', 'role:admin', 'password.fresh', 'throttle:120,1'])
        ->group(function (): void {
            Route::get('/dentists', [DentistAccountController::class, 'index']);
            Route::post('/dentists', [DentistAccountController::class, 'store']);
            Route::get('/dentists/{id}', [DentistAccountController::class, 'show']);
            Route::get('/dentists/{id}/staff', [DentistAccountController::class, 'staff']);
            Route::get('/dentists/{id}/billing', [DentistAccountController::class, 'billing']);
            Route::patch('/dentists/{id}/status', [DentistAccountController::class, 'updateStatus']);
            Route::post('/dentists/{id}/subscription', [DentistAccountController::class, 'manageSubscription']);
            Route::post('/dentists/{id}/reset-password', [DentistAccountController::class, 'resetPassword']);
            Route::post('/dentists/{id}/verify-email', [DentistAccountController::class, 'verifyEmail']);
            Route::post('/dentists/{id}/restore', [DentistAccountController::class, 'restore']);
            Route::delete('/dentists/{id}', [DentistAccountController::class, 'destroy']);
            Route::get('/payments', [AdminPaymentController::class, 'index']);
            Route::post('/payments/{id}/refund', [AdminPaymentController::class, 'refund']);
            Route::get('/plans', [PlanController::class, 'index']);
            Route::put('/plans/{code}', [PlanController::class, 'update']);
        });

    // settings/profile is the single endpoint that backs the dentist, assistant
    // AND admin "Settings → Account" form. ProfileSettingsService::update()
    // role-filters the validated payload internally (admin gets name+email only,
    // assistant gets name+email+phone, dentist keeps everything) so this route
    // can safely accept all three roles — and the admin settings page was
    // already calling it. Without 'admin' here, admins silently 403 on save.
    Route::middleware(['auth:sanctum', 'role:dentist,assistant,admin'])->group(function (): void {
        Route::get('settings/profile', [SettingsProfileController::class, 'show']);
        // Profile update is throttled to defang brute-forced email enumeration
        // and to keep the audit log from being spammed by a compromised session.
        // `password.fresh` blocks profile edits while `must_change_password`
        // is set — otherwise a forced-reset user could change their email
        // out from under the admin who reset them.
        Route::put('settings/profile', [SettingsProfileController::class, 'update'])
            ->middleware(['password.fresh', 'throttle:30,1']);
    });

    Route::post('webhooks/payx', [BillingController::class, 'payxWebhook'])
        ->middleware('throttle:120,1');

    // Subscription billing is the practice owner's concern only. Assistants
    // never need it (their read-only state is already surfaced via /auth/me),
    // and exposing the owner's plan + PayX payment history to staff would leak
    // financial data, so the whole group is dentist-only.
    Route::prefix('billing')
        // `password.fresh` mirrors the other authenticated groups — a
        // dentist whose password was force-reset can't checkout / cancel /
        // change plan until they rotate. Reads still flow through.
        ->middleware(['auth:sanctum', 'role:dentist', 'password.fresh'])
        ->group(function (): void {
            Route::get('plans', [BillingController::class, 'plans']);
            Route::get('current-subscription', [BillingController::class, 'currentSubscription']);
            Route::get('payments', [BillingController::class, 'payments']);
            Route::post('checkout', [BillingController::class, 'checkout'])
                ->middleware('throttle:10,1');
            Route::post('cancel', [BillingController::class, 'cancel'])
                ->middleware('throttle:10,1');
            Route::post('change-plan', [BillingController::class, 'changePlan'])
                ->middleware('throttle:10,1');
            // Deferred downgrade (Pro → Basic) — schedules the switch for period
            // end WITHOUT a payment. Separate from checkout precisely because no
            // invoice is created.
            Route::post('downgrade', [BillingController::class, 'downgrade'])
                ->middleware('throttle:10,1');
        });

    // `password.fresh` is the server-side enforcement of the
    // must_change_password contract: while the flag is true the middleware
    // returns 403 with `password_change_required` for any mutating verb.
    // Reads (GET/HEAD/OPTIONS) pass through so the settings page can
    // still render. Without this, a redirect-bypassed client could
    // continue to mutate data using the admin-chosen transient credential.
    // `throttle:300,1` bounds the authenticated CRUD surface (patients,
    // treatments, appointments, payments, invoices, dashboard, audit-logs)
    // to 300 requests per minute per user. Higher than the natural UX
    // ceiling (a fast dentist clicks ~30/min) but low enough that a
    // runaway client / compromised token can't hammer the DB. Auth/admin/
    // billing/team groups have their own narrower throttles.
    Route::middleware(['auth:sanctum', 'role:dentist,assistant', 'password.fresh', 'subscription.access', 'throttle:300,1'])->group(function (): void {
        Route::get('dashboard/snapshot', [DashboardController::class, 'show'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_VIEW.'|'.User::PERMISSION_PAYMENTS_VIEW);

        Route::get('patient-categories', [PatientCategoryController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::post('patient-categories', [PatientCategoryController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::put('patient-categories/{id}', [PatientCategoryController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::delete('patient-categories/{id}', [PatientCategoryController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);

        Route::get('lookups/patients', [PatientController::class, 'lookup'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_MANAGE.'|'.User::PERMISSION_PAYMENTS_MANAGE);
        Route::get('lookups/appointments', [AppointmentController::class, 'lookup'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);

        Route::get('patients', [PatientController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::post('patients', [PatientController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::get('patients/{id}', [PatientController::class, 'show'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::get('patients/{id}/overview', [PatientController::class, 'overview'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::get('patients/{id}/photo', [PatientController::class, 'downloadPhoto'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::post('patients/{id}/photo/direct-upload', [PatientController::class, 'preparePhotoUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/photo/direct-upload/{uploadId}/complete', [PatientController::class, 'finalizePhotoUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/photo', [PatientController::class, 'uploadPhoto'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::delete('patients/{id}/photo', [PatientController::class, 'deletePhoto'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::get('patients/{id}/oral-photo', [PatientController::class, 'downloadOralPhoto'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::post('patients/{id}/oral-photo/direct-upload', [PatientController::class, 'prepareOralPhotoUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/oral-photo/direct-upload/{uploadId}/complete', [PatientController::class, 'finalizeLegacyOralPhotoUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/oral-photo', [PatientController::class, 'uploadOralPhoto'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::delete('patients/{id}/oral-photo', [PatientController::class, 'deleteOralPhoto'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::get('patients/{id}/oral-photos/{viewType}', [PatientController::class, 'downloadOralPhoto'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::get('patients/{id}/oral-photos/{viewType}/{photoId}', [PatientController::class, 'downloadOralPhotoItem'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::post('patients/{id}/oral-photos/{viewType}/direct-upload', [PatientController::class, 'prepareOralPhotoUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/oral-photos/{viewType}/direct-upload/{uploadId}/complete', [PatientController::class, 'finalizeOralPhotoUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/oral-photos/{viewType}', [PatientController::class, 'uploadOralPhoto'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/oral-photos/{viewType}/{photoId}/replace', [PatientController::class, 'replaceOralPhotoItem'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::delete('patients/{id}/oral-photos/{viewType}', [PatientController::class, 'deleteOralPhoto'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::delete('patients/{id}/oral-photos/{viewType}/{photoId}', [PatientController::class, 'deleteOralPhotoItem'])
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
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::get('patients/{id}/odontogram', [PatientOdontogramController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::post('patients/{id}/odontogram', [PatientOdontogramController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::put('patients/{id}/odontogram/{entryId}', [PatientOdontogramController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::delete('patients/{id}/odontogram/{entryId}', [PatientOdontogramController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::post('patients/{id}/odontogram/{entryId}/images/direct-upload', [PatientOdontogramController::class, 'prepareImageUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/odontogram/{entryId}/images/direct-upload/{uploadId}/complete', [PatientOdontogramController::class, 'finalizeImageUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/odontogram/{entryId}/images', [PatientOdontogramController::class, 'uploadImage'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::get('patients/{id}/odontogram/{entryId}/images/{imageId}', [PatientOdontogramController::class, 'downloadImage'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::delete('patients/{id}/odontogram/{entryId}/images/{imageId}', [PatientOdontogramController::class, 'deleteImage'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);

        Route::get('patients/{id}/treatments', [PatientTreatmentController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::get('treatments', [PatientTreatmentController::class, 'indexAll'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_VIEW);
        Route::get('patients/{id}/treatments/{treatmentId}', [PatientTreatmentController::class, 'show'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::post('patients/{id}/treatments', [PatientTreatmentController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::put('patients/{id}/treatments/{treatmentId}', [PatientTreatmentController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::delete('patients/{id}/treatments/{treatmentId}', [PatientTreatmentController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);
        Route::post('patients/{id}/treatments/{treatmentId}/images/direct-upload', [PatientTreatmentController::class, 'prepareImageUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/treatments/{treatmentId}/images/direct-upload/{uploadId}/complete', [PatientTreatmentController::class, 'finalizeImageUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/treatments/{treatmentId}/images/direct-upload-batch', [PatientTreatmentController::class, 'prepareImageBatchUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/treatments/{treatmentId}/images/direct-upload-batch/complete', [PatientTreatmentController::class, 'finalizeImageBatchUpload'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/treatments/{treatmentId}/images', [PatientTreatmentController::class, 'uploadImage'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::post('patients/{id}/treatments/{treatmentId}/images/{imageId}/replace', [PatientTreatmentController::class, 'replaceImage'])
            ->middleware(['permission:'.User::PERMISSION_PATIENTS_MANAGE, MEDIA_UPLOAD_THROTTLE]);
        Route::get('patients/{id}/treatments/{treatmentId}/images/{imageId}', [PatientTreatmentController::class, 'downloadImage'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_VIEW);
        Route::delete('patients/{id}/treatments/{treatmentId}/images/{imageId}', [PatientTreatmentController::class, 'deleteImage'])
            ->middleware('permission:'.User::PERMISSION_PATIENTS_MANAGE);

        Route::get('appointments', [AppointmentController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_VIEW);
        Route::post('appointments', [AppointmentController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_MANAGE);
        Route::get('appointments/{id}', [AppointmentController::class, 'show'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_VIEW);
        Route::put('appointments/{id}', [AppointmentController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_MANAGE);
        Route::post('appointments/{id}/patient-card', [AppointmentController::class, 'createPatientCard'])
            ->middleware([
                'permission:'.User::PERMISSION_APPOINTMENTS_MANAGE,
                'permission:'.User::PERMISSION_PATIENTS_MANAGE,
            ]);
        Route::delete('appointments/{id}', [AppointmentController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_APPOINTMENTS_MANAGE);

        Route::get('invoices/{id}/download', [InvoiceController::class, 'download'])
            ->middleware(['permission:'.User::PERMISSION_PAYMENTS_VIEW, 'plan.feature:export']);
        Route::get('invoices', [InvoiceController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_VIEW);
        Route::post('invoices', [InvoiceController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);
        Route::get('invoices/{id}', [InvoiceController::class, 'show'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_VIEW);
        Route::put('invoices/{id}', [InvoiceController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);
        Route::delete('invoices/{id}', [InvoiceController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);

        Route::get('payments/ledger/patients', [PaymentLedgerController::class, 'patients'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_VIEW);
        Route::get('payments/ledger/history', [PaymentLedgerController::class, 'history'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_VIEW);
        Route::get('payments', [PaymentController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_VIEW);
        Route::post('payments', [PaymentController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);
        Route::put('payments/{id}', [PaymentController::class, 'update'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);
        Route::delete('payments/{id}', [PaymentController::class, 'destroy'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);

        // Mobile-friendly shortcut: create an Invoice + Payment in one
        // call. See app/Services/QuickPaymentService.php for the rationale
        // — mobile UI doesn't model Invoices as a separate concept, so we
        // synthesize one server-side. Uses the same PERMISSION_PAYMENTS_MANAGE
        // guard as the canonical /payments POST.
        Route::post('patients/{id}/quick-payments', [QuickPaymentController::class, 'store'])
            ->middleware('permission:'.User::PERMISSION_PAYMENTS_MANAGE);

        Route::get('audit-logs', [AuditLogController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_AUDIT_LOGS_VIEW);
    });

    Route::middleware(['auth:sanctum', 'role:dentist', 'subscription.access'])->group(function (): void {
        Route::get('team/assistants', [TeamAssistantController::class, 'index'])
            ->middleware('permission:'.User::PERMISSION_TEAM_MANAGE);
        // Team mutations are dentist-owner only (permission:team.manage) but
        // a compromised dentist session could still create/update assistants
        // rapidly. Per-route throttles match the pattern used by the admin
        // group. Password reset is the most sensitive — credential rotation
        // is loud — so it gets a stricter 10/min cap.
        Route::post('team/assistants', [TeamAssistantController::class, 'store'])
            ->middleware(['permission:'.User::PERMISSION_TEAM_MANAGE, 'throttle:30,1']);
        Route::put('team/assistants/{id}', [TeamAssistantController::class, 'update'])
            ->middleware(['permission:'.User::PERMISSION_TEAM_MANAGE, 'throttle:30,1']);
        Route::patch('team/assistants/{id}/status', [TeamAssistantController::class, 'updateStatus'])
            ->middleware(['permission:'.User::PERMISSION_TEAM_MANAGE, 'throttle:30,1']);
        Route::post('team/assistants/{id}/reset-password', [TeamAssistantController::class, 'resetPassword'])
            ->middleware(['permission:'.User::PERMISSION_TEAM_MANAGE, 'throttle:10,1']);
        Route::delete('team/assistants/{id}', [TeamAssistantController::class, 'destroy'])
            ->middleware(['permission:'.User::PERMISSION_TEAM_MANAGE, 'throttle:30,1']);
    });
});
