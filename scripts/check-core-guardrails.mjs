import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
            /Project-wide audits use the structural tracker/,
        ],
    },
    {
        name: 'Route audit program is documented and tracked',
        file: 'docs/qa/PAGE_AUDIT_STANDARD.md',
        patterns: [/## 8\. Audit completion rule/, /PAGE_AUDIT_TRACKER\.md/],
    },
    {
        name: 'Structural audit program is documented and tracked',
        file: 'docs/qa/STRUCTURAL_AUDIT_STANDARD.md',
        patterns: [
            /Default no-harm operating policy/,
            /Mandatory audit layers/,
            /Definition of Done/,
            /Reopen triggers/,
            /STRUCTURAL_AUDIT_TRACKER\.md/,
        ],
    },
    {
        name: 'Structural audit tracker includes the full program boundary',
        file: 'docs/qa/STRUCTURAL_AUDIT_TRACKER.md',
        patterns: [
            /S00.*Audit foundation/,
            /S14.*API contracts/,
            /S17.*Security, privacy/,
            /S20.*CI\/CD/,
            /Default production policy: read-only smoke/,
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
        patterns: [/MEDIA_DISK=r2/, /MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE=true/, /QUEUE_NAMES=media,cleanup,default/],
    },
    {
        name: 'Production runtime fails closed for unsafe media configuration',
        file: 'backend/app/Support/ProductionRuntimePolicyValidator.php',
        patterns: [/MEDIA_DISK must reference a private S3-compatible disk/, /MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE must be true/],
    },
    {
        name: 'Upload routes have a dedicated throttle',
        file: 'backend/routes/api.php',
        patterns: [/defined\('MEDIA_UPLOAD_THROTTLE'\)/, /MEDIA_UPLOAD_THROTTLE/],
    },
    {
        name: 'Direct upload verifier reads stored size and type',
        file: 'backend/app/Services/Media/DirectUploadObjectVerifier.php',
        patterns: [/->size\(/, /->readStream\(/, /image\/jpeg/, /image\/png/, /image\/webp/],
    },
    {
        name: 'Patient photo finalize checks stored size and type',
        file: 'backend/app/Services/PatientPhotoService.php',
        patterns: [/directUploadObjectVerifier->inspect/, /\$storedObject\['file_size'\]/, /\$storedObject\['mime_type'\]/],
    },
    {
        name: 'Oral photo finalize checks stored size and type',
        file: 'backend/app/Services/PatientClinicalPhotoService.php',
        patterns: [/directUploadObjectVerifier->inspect/, /\$storedObject\['file_size'\]/, /\$storedObject\['mime_type'\]/],
    },
    {
        name: 'Treatment image finalize checks stored size and type',
        file: 'backend/app/Services/TreatmentImageDirectUploadService.php',
        patterns: [/directUploadObjectVerifier->inspect/, /\$storedObject\['file_size'\]/, /\$storedObject\['mime_type'\]/],
    },
    {
        name: 'Frontend image upload contract matches backend formats',
        file: 'lib/media-upload.ts',
        patterns: [/image\/jpeg/, /image\/png/, /image\/webp/, /mimeType !== ''/],
    },
    {
        name: 'Frontend image upload contract has bypass regression tests',
        file: 'lib/media-upload.test.ts',
        patterns: [/image\/svg\+xml/, /image\/gif/, /application\/octet-stream/, /type: ''/],
    },
    {
        name: 'Upload size bypass regression tests exist',
        file: 'backend/tests/Feature/MediaUploadSecurityTest.php',
        patterns: [
            /test_patient_photo_direct_upload_enforces_actual_stored_size/,
            /test_patient_oral_photo_direct_upload_enforces_actual_stored_size/,
            /test_treatment_direct_upload_enforces_actual_stored_size/,
            /test_treatment_batch_direct_upload_enforces_actual_stored_size/,
            /test_patient_photo_direct_upload_rejects_non_image_stored_bytes/,
            /test_patient_oral_photo_direct_upload_rejects_non_image_stored_bytes/,
            /test_treatment_direct_upload_rejects_non_image_stored_bytes/,
            /test_treatment_batch_direct_upload_reports_non_image_stored_bytes_as_security_failure/,
            /test_stale_media_approval_cannot_overwrite_a_newer_patient_photo_upload/,
            /test_stale_media_rejection_cannot_reject_a_newer_patient_photo_upload/,
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
            /test_patient_detail_get_is_read_only_and_recent_write_is_explicit/,
            /postJson\("\/api\/v1\/patients\/recent\/\{\$patient->id\}"\)/,
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

/** Return every file below an absolute directory without extra dependencies. */
function listFilesRecursively(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolutePath = resolve(directory, entry.name);

        return entry.isDirectory() ? listFilesRecursively(absolutePath) : [absolutePath];
    });
}

/** Keep the page tracker count synchronized with the real App Router inventory. */
function assertPageInventory() {
    const tracker = readRepoFile('docs/qa/PAGE_AUDIT_TRACKER.md');
    const declaredMatch = tracker.match(/Total routed pages:\s*(\d+)/);
    if (!declaredMatch) {
        throw new Error('Page audit tracker does not declare Total routed pages.');
    }

    const routedPages = listFilesRecursively(resolve(REPO_ROOT, 'app'))
        .filter((absolutePath) => absolutePath.endsWith('page.tsx'));
    const declaredCount = Number(declaredMatch[1]);

    if (declaredCount !== routedPages.length) {
        throw new Error(
            `Page audit inventory drifted: tracker declares ${declaredCount}, App Router contains ${routedPages.length}.`
        );
    }
}

/** Structural sections are intentionally contiguous so none silently disappear. */
function assertStructuralInventory() {
    const tracker = readRepoFile('docs/qa/STRUCTURAL_AUDIT_TRACKER.md');
    const sectionIds = [...tracker.matchAll(/\|\s*\d+\s*\|\s*(S\d{2})\s*\|/g)]
        .map((match) => match[1]);
    const expectedIds = Array.from({ length: 21 }, (_, index) => `S${String(index).padStart(2, '0')}`);

    if (sectionIds.length !== expectedIds.length || sectionIds.some((id, index) => id !== expectedIds[index])) {
        throw new Error(
            `Structural audit inventory drifted: expected ${expectedIds.join(', ')}, found ${sectionIds.join(', ')}.`
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

for (const [name, assertion] of [
    ['Page audit route inventory matches App Router', assertPageInventory],
    ['Structural audit section inventory is contiguous', assertStructuralInventory],
]) {
    try {
        assertion();
        console.log(`ok - ${name}`);
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
