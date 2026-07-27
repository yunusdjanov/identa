import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const checks = [
    {
        name: 'Core rules are documented',
        file: 'docs/qa/CORE_QUALITY_RULES.md',
        patterns: [
            /Patient, payment, upload, and auth changes are high-risk/,
            /Bug fix = regression test/,
            /List endpoints must be paginated/,
            /Upload finalize must verify real object size and type/,
            /Every release runs the short release checklist/,
        ],
    },
    {
        name: 'API list contract requires pagination',
        file: 'docs/api/CONVENTIONS.md',
        patterns: [/## Pagination/, /"pagination"/, /per_page/],
    },
    {
        name: 'Release runbook includes core guardrails',
        file: 'docs/release/PRE_DEPLOY_RUNBOOK.md',
        patterns: [/check:core-guardrails/, /CORE_QUALITY_RULES\.md/],
    },
    {
        name: 'Release preflight runs guardrails and full quality',
        file: 'scripts/release-preflight.ps1',
        patterns: [/npm run check:core-guardrails/, /npm run quality:all/],
    },
    {
        name: 'Package exposes guardrail and release commands',
        file: 'package.json',
        patterns: [/"check:core-guardrails"/, /"release:preflight"/, /"quality:all"/],
    },
    {
        name: 'Direct upload verification defaults on',
        file: 'backend/config/filesystems.php',
        patterns: [/MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE/, /env\('MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE', true\)/],
    },
    {
        name: 'Production env example keeps upload verification on',
        file: 'backend/.env.example',
        patterns: [/MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE=true/],
    },
    {
        name: 'Upload routes have a dedicated throttle',
        file: 'backend/routes/api.php',
        patterns: [/defined\('MEDIA_UPLOAD_THROTTLE'\)/, /MEDIA_UPLOAD_THROTTLE/],
    },
    {
        name: 'Patient photo finalize checks stored size',
        file: 'backend/app/Services/PatientPhotoService.php',
        patterns: [/resolveUploadedObjectSize/, /\$storedSize/, /ensureUploadFileAllowed/],
    },
    {
        name: 'Oral photo finalize checks stored size',
        file: 'backend/app/Services/PatientClinicalPhotoService.php',
        patterns: [/resolveUploadedObjectSize/, /\$storedSize/, /ensureUploadFileAllowed/],
    },
    {
        name: 'Treatment image finalize checks stored size',
        file: 'backend/app/Services/TreatmentImageDirectUploadService.php',
        patterns: [/resolveUploadedObjectSize/, /\$storedSize/, /ensureUploadFileAllowed/],
    },
    {
        name: 'Upload size bypass regression tests exist',
        file: 'backend/tests/Feature/MediaUploadSecurityTest.php',
        patterns: [
            /test_patient_photo_direct_upload_enforces_actual_stored_size/,
            /test_patient_oral_photo_direct_upload_enforces_actual_stored_size/,
            /test_treatment_direct_upload_enforces_actual_stored_size/,
            /test_treatment_batch_direct_upload_enforces_actual_stored_size/,
        ],
    },
    {
        name: 'Payment ledger has backend pagination tests',
        file: 'backend/tests/Feature/PaymentLedgerApiTest.php',
        patterns: [/paginated_patient_balances/, /history_ledger_is_paginated/, /meta\.pagination/],
    },
    {
        name: 'High-risk patient tests exist',
        file: 'backend/tests/Feature/PatientApiTest.php',
        patterns: [
            /test_dentist_can_list_only_owned_patients/,
            /test_patient_detail_does_not_update_recent_patients_without_search_flag/,
            /test_dentist_cannot_access_other_dentist_patient_records/,
        ],
    },
    {
        name: 'High-risk auth session tests exist',
        file: 'backend/tests/Feature/AuthSessionTest.php',
        patterns: [/test_user_can_login_and_fetch_profile_via_session/, /test_mobile_logout_revokes_current_bearer_token/],
    },
];

/** Read a repo-relative text file. */
function readRepoFile(relativePath) {
    const absolutePath = resolve(REPO_ROOT, relativePath);
    if (!existsSync(absolutePath)) {
        throw new Error(`Missing required file: ${relativePath}`);
    }

    return readFileSync(absolutePath, 'utf8');
}

/** Assert that every regex exists in the target file. */
function assertPatterns(check) {
    const content = readRepoFile(check.file);
    const missingPatterns = check.patterns.filter((pattern) => !pattern.test(content));

    if (missingPatterns.length > 0) {
        throw new Error(
            `${check.name} failed in ${check.file}: missing ${missingPatterns.map(String).join(', ')}`
        );
    }
}

const failures = [];

for (const check of checks) {
    try {
        assertPatterns(check);
        console.log(`ok - ${check.name}`);
    } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
    }
}

if (failures.length > 0) {
    console.error('\nCore guardrail check failed:');
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exitCode = 1;
} else {
    console.log('\nCore guardrails passed.');
}
