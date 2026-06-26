# Command Matrix

## Local Gate Order

1. Core quality guardrail drift check
```bash
npm run check:core-guardrails
```
2. Frontend static checks
```bash
npm run lint
npm run build
```
3. Frontend unit/component tests
```bash
npm test
```
4. Backend schema sync (idempotent, prevents migration drift)
```bash
npm run db:migrate
```
5. Backend automated tests
```bash
npm run test:backend
```
6. Critical end-to-end flows
```bash
npm run test:e2e
```
7. Dependency vulnerability scan
```bash
npm run quality:security
```
8. Secrets preflight validation
```bash
npm run check:secrets
```
9. Runtime security policy preflight
```bash
npm run check:runtime-security
```
10. Release preflight (all security blockers)
```bash
npm run release:preflight
npm run release:preflight:production
```

## One-Command Local Verification

```bash
npm run quality:all
```

This command runs:
- `quality:frontend` (`lint` + `build` + `test`)
- backend tests
- backend migration sync + pending-migration check
- Playwright critical flow suite

## Core Guardrail Drift Check

```bash
npm run check:core-guardrails
```

This command verifies the five release-blocking rules documented in
`docs/qa/CORE_QUALITY_RULES.md`: high-risk test coverage exists, bug fixes
stay tied to regression-test discipline, list endpoints keep the pagination
contract, direct upload finalize keeps stored-size/type verification, and
the release checklist still runs the guardrails.

## Security Gate

```bash
npm run quality:security
```

This command runs:
- `npm audit --audit-level=high`
- `composer audit --locked`

## CI Recommendation

Run the same sequence used locally:
1. `npm run quality:frontend`
2. `npm run test:backend`
3. `npm run quality:security`
4. `npm run test:e2e`

Current workflow baseline:
- `.github/workflows/ci-quality-security.yml` runs the core guardrail check,
  frontend quality, backend tests, and dependency security on `push` and
  `pull_request`.

If runtime is a concern:
- keep the core guardrail, frontend quality, and backend tests required on
  every pull request
- keep dependency security required on every pull request for drift control
- run E2E on protected branches and nightly
