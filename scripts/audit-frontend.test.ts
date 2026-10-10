import { describe, expect, it } from 'vitest';

// The production script stays dependency-free and is executed directly by Node.
import { evaluateAuditReport } from './audit-frontend.mjs';

const knownAdvisory = {
    source: 1124334,
    url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg',
    severity: 'high',
};

const knownBracesAdvisory = {
    source: 1240992,
    url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
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

    it('accepts the reviewed braces advisory only through its development-only lint chain', () => {
        const report = {
            vulnerabilities: {
                braces: {
                    severity: 'high',
                    via: [knownBracesAdvisory],
                    nodes: ['node_modules/braces'],
                },
                micromatch: {
                    severity: 'high',
                    via: ['braces'],
                    nodes: ['node_modules/micromatch'],
                },
                'fast-glob': {
                    severity: 'high',
                    via: ['micromatch'],
                    nodes: ['node_modules/fast-glob'],
                },
            },
        };
        const lockfile = {
            packages: {
                'node_modules/braces': { dev: true },
                'node_modules/micromatch': { dev: true },
                'node_modules/fast-glob': { dev: true },
            },
        };

        expect(evaluateAuditReport(report, lockfile)).toEqual({
            ok: true,
            accepted: ['braces', 'micromatch', 'fast-glob'],
            violations: [],
        });
    });

    it('blocks the reviewed braces advisory if braces is a production dependency', () => {
        const report = {
            vulnerabilities: {
                braces: {
                    severity: 'high',
                    via: [knownBracesAdvisory],
                    nodes: ['node_modules/braces'],
                },
            },
        };
        const lockfile = {
            packages: {
                'node_modules/braces': {},
            },
        };

        expect(evaluateAuditReport(report, lockfile)).toEqual({
            ok: false,
            accepted: [],
            violations: ['braces (high)'],
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
