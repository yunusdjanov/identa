import { describe, expect, it } from 'vitest';

// The production script stays dependency-free and is executed directly by Node.
import { evaluateAuditReport } from './audit-frontend.mjs';

const knownAdvisory = {
    source: 1124334,
    url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg',
    severity: 'high',
};

describe('frontend audit gate', () => {
    it('passes a clean audit report', () => {
        expect(evaluateAuditReport({ vulnerabilities: {} }, { packages: {} })).toEqual({
            ok: true,
            accepted: [],
            violations: [],
        });
    });

    it('accepts only the reviewed advisory through a development-only dependency chain', () => {
        const report = {
            vulnerabilities: {
                'brace-expansion': {
                    severity: 'high',
                    via: [knownAdvisory],
                    nodes: ['node_modules/brace-expansion'],
                },
                minimatch: {
                    severity: 'high',
                    via: ['brace-expansion'],
                    nodes: ['node_modules/minimatch'],
                },
            },
        };
        const lockfile = {
            packages: {
                'node_modules/brace-expansion': { dev: true },
                'node_modules/minimatch': { dev: true },
            },
        };

        expect(evaluateAuditReport(report, lockfile)).toEqual({
            ok: true,
            accepted: ['brace-expansion', 'minimatch'],
            violations: [],
        });
    });

    it('blocks the reviewed advisory if any affected package is shipped to production', () => {
        const report = {
            vulnerabilities: {
                'brace-expansion': {
                    severity: 'high',
                    via: [knownAdvisory],
                    nodes: ['node_modules/brace-expansion'],
                },
            },
        };
        const lockfile = {
            packages: {
                'node_modules/brace-expansion': {},
            },
        };

        expect(evaluateAuditReport(report, lockfile)).toEqual({
            ok: false,
            accepted: [],
            violations: ['brace-expansion (high)'],
        });
    });

    it('blocks every unreviewed high-severity advisory', () => {
        const report = {
            vulnerabilities: {
                example: {
                    severity: 'critical',
                    via: [
                        {
                            source: 9999999,
                            url: 'https://github.com/advisories/GHSA-unknown',
                            severity: 'critical',
                        },
                    ],
                    nodes: ['node_modules/example'],
                },
            },
        };
        const lockfile = {
            packages: {
                'node_modules/example': { dev: true },
            },
        };

        expect(evaluateAuditReport(report, lockfile)).toEqual({
            ok: false,
            accepted: [],
            violations: ['example (critical)'],
        });
    });
});
