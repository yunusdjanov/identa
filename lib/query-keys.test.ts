import { describe, expect, it } from 'vitest';

import { queryKeys } from '@/lib/query-keys';

describe('queryKeys', () => {
    it('keeps dentist detail queries under one invalidation prefix', () => {
        const root = queryKeys.admin.dentists.detail('dentist-1');

        expect(queryKeys.admin.dentists.billing('dentist-1').slice(0, root.length)).toEqual(root);
        expect(queryKeys.admin.dentists.staff('dentist-1').slice(0, root.length)).toEqual(root);
        expect(queryKeys.admin.dentists.auditLogs('dentist-1').slice(0, root.length)).toEqual(root);
    });

    it('uses one canonical dentist audit-log key', () => {
        expect(queryKeys.admin.dentists.auditLogs('dentist-1')).toEqual([
            'admin',
            'dentists',
            'dentist-1',
            'audit-logs',
        ]);
    });

    it('keeps patient reads under the canonical patient detail prefix', () => {
        const detail = queryKeys.patients.detail('patient-1');

        expect(queryKeys.patients.overview('patient-1', '2026-07-30').slice(0, detail.length))
            .toEqual(detail);
        expect(queryKeys.patients.treatment('patient-1', 'treatment-1').slice(0, detail.length))
            .toEqual(detail);
    });

    it('keeps settings and lookup variants under stable invalidation prefixes', () => {
        const settingsRoot = queryKeys.settings.all();
        const patientsRoot = queryKeys.patients.all();

        expect(queryKeys.settings.teamAssistants('ali', 'active', 2).slice(0, settingsRoot.length))
            .toEqual(settingsRoot);
        expect(queryKeys.settings.auditLogs('login', null, 1).slice(0, settingsRoot.length))
            .toEqual(settingsRoot);
        expect(queryKeys.patients.lookup('selected', 'patient-1').slice(0, patientsRoot.length))
            .toEqual(patientsRoot);
    });
});
