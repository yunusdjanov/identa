<?php

use App\Jobs\GenerateMediaVariants;
use App\Models\Patient;
use App\Models\TreatmentImage;
use App\Support\ProductionSecretsValidator;
use App\Support\ProductionRuntimePolicyValidator;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use App\Models\Invoice;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('security:check-secrets', function () {
    /** @var ProductionSecretsValidator $secretValidator */
    $secretValidator = app(ProductionSecretsValidator::class);

    $issues = $secretValidator->findProductionIssues();

    if ($issues === []) {
        $this->info('Secrets check passed: required production secrets look valid.');

        return 0;
    }

    $this->error('Secrets check failed:');
    foreach ($issues as $issue) {
        $this->line("- {$issue}");
    }

    return 1;
})->purpose('Validate required production secret configuration and fail on insecure placeholders');

Artisan::command('security:check-runtime {--production : Force production-policy checks even outside APP_ENV=production}', function () {
    $checkForProduction = (bool) $this->option('production') || app()->environment('production');

    if (!$checkForProduction) {
        $this->warn('Runtime security policy check skipped (not in production). Use --production to force.');

        return 0;
    }

    /** @var ProductionRuntimePolicyValidator $runtimePolicyValidator */
    $runtimePolicyValidator = app(ProductionRuntimePolicyValidator::class);
    $issues = $runtimePolicyValidator->findProductionIssues();

    if ($issues === []) {
        $this->info('Runtime security policy check passed for production.');

        return 0;
    }

    $this->error('Runtime security policy check failed:');
    foreach ($issues as $issue) {
        $this->line("- {$issue}");
    }

    return 1;
})->purpose('Validate edge/TLS runtime policy requirements for production');

Artisan::command('invoices:normalize-numbers {--commit : Persist changes (default is dry-run)} {--dentist_id= : Normalize invoices only for one dentist id}', function () {
    $dentistIdFilter = $this->option('dentist_id');
    $commit = (bool) $this->option('commit');

    $query = Invoice::query()
        ->select(['id', 'dentist_id', 'invoice_number', 'invoice_date', 'created_at'])
        ->orderBy('dentist_id')
        ->orderBy('invoice_date')
        ->orderBy('created_at')
        ->orderBy('id');

    if (is_string($dentistIdFilter) && trim($dentistIdFilter) !== '') {
        $trimmedDentistId = trim($dentistIdFilter);
        if (!ctype_digit($trimmedDentistId)) {
            $this->error('The --dentist_id option must be a numeric user id.');

            return 1;
        }

        $query->where('dentist_id', (int) $trimmedDentistId);
    }

    /** @var \Illuminate\Support\Collection<int, Invoice> $invoices */
    $invoices = $query->get();
    if ($invoices->isEmpty()) {
        $this->info('No invoices found for normalization.');

        return 0;
    }

    $sequenceByScope = [];
    $updates = [];

    foreach ($invoices as $invoice) {
        $month = $invoice->invoice_date?->format('ym') ?? $invoice->created_at?->format('ym') ?? now()->format('ym');
        $scopeKey = "{$invoice->dentist_id}|{$month}";

        $nextSequence = ($sequenceByScope[$scopeKey] ?? 0) + 1;
        if ($nextSequence > 9999) {
            $this->error("Monthly sequence overflow for dentist {$invoice->dentist_id}, month {$month}.");

            return 1;
        }

        $sequenceByScope[$scopeKey] = $nextSequence;
        $normalizedNumber = 'INV-'.$month.'-'.str_pad((string) $nextSequence, 4, '0', STR_PAD_LEFT);

        if ($invoice->invoice_number === $normalizedNumber) {
            continue;
        }

        $updates[] = [
            'id' => $invoice->id,
            'dentist_id' => (string) $invoice->dentist_id,
            'from' => (string) $invoice->invoice_number,
            'to' => $normalizedNumber,
        ];
    }

    $totalInvoices = $invoices->count();
    $totalChanges = count($updates);
    $modeLabel = $commit ? 'COMMIT' : 'DRY-RUN';
    $this->info("Invoice normalization mode: {$modeLabel}");
    $this->line("Scanned invoices: {$totalInvoices}");
    $this->line("Planned changes: {$totalChanges}");

    if ($totalChanges === 0) {
        $this->info('All invoice numbers are already normalized.');

        return 0;
    }

    $previewRows = array_slice($updates, 0, 25);
    $this->table(['id', 'dentist_id', 'from', 'to'], $previewRows);
    if ($totalChanges > count($previewRows)) {
        $remaining = $totalChanges - count($previewRows);
        $this->line("... plus {$remaining} more change(s).");
    }

    if (!$commit) {
        $this->comment('Dry-run only. Re-run with --commit to apply changes.');

        return 0;
    }

    DB::transaction(function () use ($updates): void {
        foreach ($updates as $update) {
            Invoice::query()
                ->where('id', $update['id'])
                ->update(['invoice_number' => $update['to']]);
        }
    });

    $duplicateCount = Invoice::query()
        ->select('dentist_id', 'invoice_number', DB::raw('COUNT(*) as aggregate_count'))
        ->groupBy('dentist_id', 'invoice_number')
        ->having('aggregate_count', '>', 1)
        ->get()
        ->count();

    if ($duplicateCount > 0) {
        $this->error('Normalization completed with duplicate invoice numbers detected.');

        return 1;
    }

    $this->info('Invoice numbers normalized successfully.');

    return 0;
})->purpose('Normalize historical invoice numbers to INV-YYMM-#### format');

Artisan::command('users:ensure-account {email} {password} {--name=} {--role=dentist} {--activate : Mark the user as active}', function () {
    $email = trim((string) $this->argument('email'));
    $password = (string) $this->argument('password');
    $role = trim((string) $this->option('role'));
    $providedName = trim((string) $this->option('name'));

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $this->error('A valid email address is required.');

        return 1;
    }

    if ($password === '') {
        $this->error('A non-empty password is required.');

        return 1;
    }

    if (! in_array($role, [User::ROLE_ADMIN, User::ROLE_DENTIST, User::ROLE_ASSISTANT], true)) {
        $this->error('The --role option must be one of: admin, dentist, assistant.');

        return 1;
    }

    $user = User::query()->firstOrNew(['email' => $email]);
    $isNew = ! $user->exists;

    if ($isNew) {
        $user->name = $providedName !== '' ? $providedName : 'Demo User';
        $user->role = $role;
        $user->account_status = User::ACCOUNT_STATUS_ACTIVE;
        $user->must_change_password = false;
    } elseif ($providedName !== '') {
        $user->name = $providedName;
    }

    if ($this->option('activate')) {
        $user->account_status = User::ACCOUNT_STATUS_ACTIVE;
    }

    $user->password = $password;
    $user->save();

    $this->info(sprintf(
        '%s account for %s (%s).',
        $isNew ? 'Created' : 'Updated',
        $user->email,
        $user->role
    ));

    return 0;
})->purpose('Create or update a user account with a known password for maintenance or demo access');

Artisan::command(
    'app:reset-test-data {--force : Required to confirm destructive cleanup} {--email=admin@identa.uz : Super admin email} {--password=password123 : Super admin password} {--name=Platform Super Admin : Super admin display name}',
    function () {
        if (! $this->option('force')) {
            $this->error('This command is destructive. Re-run with --force to continue.');

            return 1;
        }

        $adminEmail = trim((string) $this->option('email'));
        $adminPassword = (string) $this->option('password');
        $adminName = trim((string) $this->option('name'));

        if ($adminEmail === '' || ! filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
            $this->error('A valid admin email is required.');

            return 1;
        }

        if ($adminPassword === '') {
            $this->error('A non-empty admin password is required.');

            return 1;
        }

        $mediaDisk = (string) config('filesystems.media_disk', 'local');
        foreach (['patients', 'treatments', 'odontogram'] as $directory) {
            try {
                Storage::disk($mediaDisk)->deleteDirectory($directory);
            } catch (\Throwable $exception) {
                $this->warn(sprintf('Media cleanup skipped for "%s" on disk "%s".', $directory, $mediaDisk));
            }
        }

        $tables = [
            'audit_logs',
            'invoice_items',
            'payments',
            'invoices',
            'treatment_images',
            'treatments',
            'odontogram_entry_images',
            'odontogram_entries',
            'appointments',
            'patient_category_patient',
            'patient_categories',
            'patients',
            'sessions',
            'cache',
            'cache_locks',
            'jobs',
            'failed_jobs',
            'job_batches',
            'password_reset_tokens',
            'users',
        ];

        $existingTables = array_values(array_filter($tables, static fn (string $table): bool => Schema::hasTable($table)));
        if ($existingTables !== []) {
            $quotedTables = implode(', ', array_map(static fn (string $table): string => '"'.$table.'"', $existingTables));
            DB::statement("TRUNCATE TABLE {$quotedTables} RESTART IDENTITY CASCADE");
        }

        $admin = User::query()->create([
            'name' => $adminName !== '' ? $adminName : 'Platform Super Admin',
            'email' => $adminEmail,
            'password' => $adminPassword,
            'role' => User::ROLE_ADMIN,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
            'dentist_owner_id' => null,
            'assistant_permissions' => null,
            'must_change_password' => false,
            'phone' => null,
            'practice_name' => null,
            'license_number' => null,
            'address' => null,
            'working_hours_start' => '09:00',
            'working_hours_end' => '20:00',
            'default_appointment_duration' => 30,
        ]);

        $this->info(sprintf(
            'Application data reset completed. Super admin ready: %s (%s).',
            $admin->email,
            $admin->role
        ));

        return 0;
    }
)->purpose('Clear application data, purge stored media, and leave a single super admin account');

Artisan::command('media:queue-variants {--force : Queue regeneration even if variants already exist}', function () {
    $force = (bool) $this->option('force');

    $buildVariantDefinitions = static function (string $path, array $maxEdges): array {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        $variants = [];

        foreach ($maxEdges as $variant => $maxEdge) {
            $variants[$variant] = [
                'path' => sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension),
                'max_edge' => $maxEdge,
            ];
        }

        return $variants;
    };

    $hasMissingVariants = static function (string $disk, array $variants) use ($force): bool {
        if ($force) {
            return true;
        }

        foreach ($variants as $variant) {
            $variantPath = trim((string) ($variant['path'] ?? ''));
            if ($variantPath !== '' && ! Storage::disk($disk)->exists($variantPath)) {
                return true;
            }
        }

        return false;
    };

    $queuedPatientPhotos = 0;
    Patient::query()
        ->whereNotNull('photo_path')
        ->select(['id', 'photo_disk', 'photo_path'])
        ->chunk(100, function ($patients) use (&$queuedPatientPhotos, $buildVariantDefinitions, $hasMissingVariants): void {
            foreach ($patients as $patient) {
                $path = trim((string) $patient->photo_path);
                $disk = is_string($patient->photo_disk) && trim($patient->photo_disk) !== ''
                    ? trim($patient->photo_disk)
                    : (string) config('filesystems.media_disk', 'local');

                if ($path === '' || $disk === '' || ! Storage::disk($disk)->exists($path)) {
                    continue;
                }

                $variants = $buildVariantDefinitions($path, [
                    'thumbnail' => 160,
                    'preview' => 960,
                ]);

                if (! $hasMissingVariants($disk, $variants)) {
                    continue;
                }

                GenerateMediaVariants::dispatch(
                    disk: $disk,
                    sourcePath: $path,
                    variants: $variants,
                    logContext: 'Patient photo',
                );
                $queuedPatientPhotos++;
            }
        });

    $queuedTreatmentImages = 0;
    TreatmentImage::query()
        ->select(['id', 'disk', 'path'])
        ->chunk(200, function ($images) use (&$queuedTreatmentImages, $buildVariantDefinitions, $hasMissingVariants): void {
            foreach ($images as $image) {
                $path = trim((string) $image->path);
                $disk = trim((string) $image->disk);

                if ($path === '' || $disk === '' || ! Storage::disk($disk)->exists($path)) {
                    continue;
                }

                $variants = $buildVariantDefinitions($path, [
                    'thumbnail' => 200,
                    'preview' => 1280,
                ]);

                if (! $hasMissingVariants($disk, $variants)) {
                    continue;
                }

                GenerateMediaVariants::dispatch(
                    disk: $disk,
                    sourcePath: $path,
                    variants: $variants,
                    logContext: 'Treatment image',
                );
                $queuedTreatmentImages++;
            }
        });

    $this->info(sprintf(
        'Queued %d patient photo job(s) and %d treatment image job(s).',
        $queuedPatientPhotos,
        $queuedTreatmentImages
    ));

    return 0;
})->purpose('Queue missing patient photo and treatment image variants for background generation');
