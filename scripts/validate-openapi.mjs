import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = resolve(REPO_ROOT, 'docs/api/openapi.v1.yaml');

const requiredPaths = [
    '/api/v1/auth/csrf-token',
    '/api/v1/auth/register',
    '/api/v1/auth/google',
    '/api/v1/auth/login',
    '/api/v1/auth/logout',
    '/api/v1/auth/refresh',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
    '/api/v1/auth/me',
    '/api/v1/auth/change-password',
    '/api/v1/auth/email/verification-notification',
    '/api/v1/auth/email/verify/{id}/{hash}',
    '/api/v1/auth/google/link',
    '/api/v1/lookups/patients',
    '/api/v1/patient-categories',
    '/api/v1/patient-categories/{id}',
    '/api/v1/patients',
    '/api/v1/patients/recent',
    '/api/v1/patients/recent/{id}',
    '/api/v1/patients/{id}',
    '/api/v1/patients/{id}/overview',
    '/api/v1/patients/{id}/restore',
    '/api/v1/patients/{id}/force',
    '/api/v1/patients/{id}/treatments',
    '/api/v1/patients/{id}/treatments/{treatmentId}',
    '/api/v1/patients/{id}/photo/direct-upload',
    '/api/v1/patients/{id}/oral-photos/{viewType}/direct-upload',
    '/api/v1/patients/{id}/treatments/{treatmentId}/images/direct-upload-batch',
    '/api/v1/appointments/{id}/patient-card',
    '/api/v1/payments/ledger/patients',
    '/api/v1/payments/ledger/history',
    '/api/v1/admin/analytics/summary',
    '/api/v1/admin/dentists',
    '/api/v1/admin/dentists/{id}',
    '/api/v1/admin/dentists/{id}/staff',
    '/api/v1/admin/dentists/{id}/billing',
    '/api/v1/admin/dentists/{id}/audit-logs',
    '/api/v1/admin/dentists/{id}/status',
    '/api/v1/admin/dentists/{id}/subscription',
    '/api/v1/admin/dentists/{id}/reset-password',
    '/api/v1/admin/dentists/{id}/verify-email',
    '/api/v1/admin/dentists/{id}/restore',
    '/api/v1/admin/payments',
    '/api/v1/admin/payments/{id}/refund',
    '/api/v1/admin/plans',
    '/api/v1/admin/plans/{code}',
];

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

function readContract() {
    return YAML.parse(readFileSync(CONTRACT_PATH, 'utf8'), { prettyErrors: true });
}

function resolveJsonPointer(root, ref) {
    if (!ref.startsWith('#/')) {
        throw new Error(`Only local refs are supported in OpenAPI guard: ${ref}`);
    }

    return ref
        .slice(2)
        .split('/')
        .reduce((value, segment) => {
            const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');

            return value?.[key];
        }, root);
}

function collectRefs(value, refs = []) {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectRefs(item, refs);
        }

        return refs;
    }

    if (value !== null && typeof value === 'object') {
        if (typeof value.$ref === 'string') {
            refs.push(value.$ref);
        }

        for (const item of Object.values(value)) {
            collectRefs(item, refs);
        }
    }

    return refs;
}

function getParameterName(root, parameter) {
    const resolved = parameter.$ref ? resolveJsonPointer(root, parameter.$ref) : parameter;

    return resolved?.name;
}

function assertPathParameters(root, pathKey, operation) {
    const pathParams = [...pathKey.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
    if (pathParams.length === 0) {
        return;
    }

    const operationParams = new Set((operation.parameters ?? []).map((parameter) => getParameterName(root, parameter)));
    const missing = pathParams.filter((name) => !operationParams.has(name));

    if (missing.length > 0) {
        throw new Error(`${pathKey} is missing path parameter definitions: ${missing.join(', ')}`);
    }
}

function assertRequiredPaths(root) {
    const missing = requiredPaths.filter((pathKey) => !root.paths?.[pathKey]);
    if (missing.length > 0) {
        throw new Error(`OpenAPI contract is missing current backend paths: ${missing.join(', ')}`);
    }
}

function assertRefsResolve(root) {
    const missing = collectRefs(root).filter((ref) => resolveJsonPointer(root, ref) === undefined);
    if (missing.length > 0) {
        throw new Error(`OpenAPI contract has unresolved refs: ${[...new Set(missing)].join(', ')}`);
    }
}

function assertOperations(root) {
    for (const [pathKey, pathItem] of Object.entries(root.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem ?? {})) {
            if (!httpMethods.has(method)) {
                continue;
            }

            assertPathParameters(root, pathKey, operation);
        }
    }
}

const contract = readContract();

if (contract?.openapi !== '3.1.0') {
    throw new Error(`Unexpected OpenAPI version: ${contract?.openapi ?? 'missing'}`);
}

assertRequiredPaths(contract);
assertRefsResolve(contract);
assertOperations(contract);

console.log(`OpenAPI contract passed (${Object.keys(contract.paths ?? {}).length} paths).`);
