# Command Matrix

## Local Gate Order

1. Frontend static checks
```bash
npm run lint
npm run build
```
2. Frontend unit/component tests
```bash
npm test
```
3. Backend schema sync (idempotent, prevents migration drift)
```bash
npm run db:migrate
```
4. Backend automated tests
```bash
npm run test:backend
```
5. Critical end-to-end flows
```bash
npm run test:e2e
```
6. Dependency vulnerability scan
```bash
npm run quality:security
```
7. Secrets preflight validation
```bash
npm run check:secrets
```
8. Runtime security policy preflight
```bash
npm run check:runtime-security
```
9. Release preflight (all security blockers)
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
- `.github/workflows/ci-quality-security.yml` runs steps 1-3 on `push` and `pull_request`.

If runtime is a concern:
- keep steps 1 and 2 required on every pull request
- keep step 3 required on every pull request for dependency drift control
- run step 4 on protected branches and nightly
