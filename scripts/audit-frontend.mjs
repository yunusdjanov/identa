import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_DEV_ADVISORIES = new Map([
  [
    1124334,
    {
      url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg',
      reason:
        'Upstream ESLint plugins still require an incompatible minimatch major; the affected tree is development-only.',
    },
  ],
]);

const severityRank = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function isHighSeverity(vulnerability) {
  return (severityRank[vulnerability?.severity] ?? Number.POSITIVE_INFINITY) >= severityRank.high;
}

function isAllowedAdvisory(advisory) {
  if (!advisory || typeof advisory !== 'object') {
    return false;
  }

  const allowed = ALLOWED_DEV_ADVISORIES.get(advisory.source);
  return allowed?.url === advisory.url;
}

/**
 * Allows only explicitly reviewed advisories whose complete dependency path is
 * development-only. Any production exposure or unrelated high advisory fails.
 */
export function evaluateAuditReport(report, lockfile) {
  if (!report || typeof report !== 'object' || !report.vulnerabilities) {
    return {
      ok: false,
      accepted: [],
      violations: ['npm audit did not return a vulnerability report.'],
    };
  }

  const vulnerabilities = report.vulnerabilities;
  const packages = lockfile?.packages ?? {};
  const memo = new Map();
  const visiting = new Set();

  const isAcceptedDevPath = (name) => {
    if (memo.has(name)) {
      return memo.get(name);
    }
    if (visiting.has(name)) {
      return false;
    }

    const vulnerability = vulnerabilities[name];
    if (!vulnerability || !Array.isArray(vulnerability.via) || vulnerability.via.length === 0) {
      memo.set(name, false);
      return false;
    }

    visiting.add(name);
    const hasOnlyAllowedCauses = vulnerability.via.every((cause) =>
      typeof cause === 'string' ? isAcceptedDevPath(cause) : isAllowedAdvisory(cause),
    );
    visiting.delete(name);

    const nodes = Array.isArray(vulnerability.nodes) ? vulnerability.nodes : [];
    const isDevelopmentOnly =
      nodes.length > 0 && nodes.every((node) => packages[node]?.dev === true);
    const accepted = hasOnlyAllowedCauses && isDevelopmentOnly;
    memo.set(name, accepted);
    return accepted;
  };

  const accepted = [];
  const violations = [];

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (!isHighSeverity(vulnerability)) {
      continue;
    }

    if (isAcceptedDevPath(name)) {
      accepted.push(name);
    } else {
      violations.push(`${name} (${vulnerability.severity ?? 'unknown'})`);
    }
  }

  return {
    ok: violations.length === 0,
    accepted,
    violations,
  };
}

function runAudit() {
  const root = process.cwd();
  const lockfilePath = path.join(root, 'package-lock.json');
  const npmCli = process.env.npm_execpath;
  const executable = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = npmCli
    ? [npmCli, 'audit', '--json', '--audit-level=high']
    : ['audit', '--json', '--audit-level=high'];
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    shell: !npmCli && process.platform === 'win32',
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error(result.stderr || result.stdout || 'npm audit returned invalid JSON.');
    return 1;
  }

  let lockfile;
  try {
    lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  } catch (error) {
    console.error(`Unable to read package-lock.json: ${error.message}`);
    return 1;
  }

  const evaluation = evaluateAuditReport(report, lockfile);
  if (!evaluation.ok) {
    console.error(`Blocking frontend advisories: ${evaluation.violations.join(', ')}`);
    console.error(result.stdout);
    return 1;
  }

  if (evaluation.accepted.length > 0) {
    const advisory = ALLOWED_DEV_ADVISORIES.get(1124334);
    console.warn(
      `Accepted dev-only ${advisory.url} through: ${evaluation.accepted.join(', ')}. ${advisory.reason}`,
    );
  } else {
    console.log('Frontend dependency audit passed with no high or critical advisories.');
  }

  return 0;
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  process.exitCode = runAudit();
}
