import { NextResponse } from 'next/server';
import { getAdminStore, isoDaysFromNow, pushAuditEntry } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../_auth';

const ALLOWED_CURRENCIES = ['UZS', 'USD', 'EUR'] as const;
const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'read_only', 'trialing', 'grace']);

type ValidationErrors = Record<string, string[]>;

interface ValidatedPayload {
    name: string;
    description: string | null;
    trial_days: number | null;
    monthly_price: number | null;
    yearly_price: number | null;
    currency: string;
    staff_limit: number;
    entry_image_limit: number;
    upload_max_mb: number;
    stored_image_max_mb: number;
    can_export: boolean;
    is_active: boolean;
    sort_order: number;
}

type ValidationResult =
    | { ok: true; value: ValidatedPayload }
    | { ok: false; errors: ValidationErrors };

function fail(errors: ValidationErrors) {
    return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
}

function isPositiveInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function validate(body: Record<string, unknown>): ValidationResult {
    const errors: ValidationErrors = {};

    if (!isNonEmptyString(body.name, 255)) {
        errors.name = ['Name is required and must be a string up to 255 characters.'];
    }

    if (body.description !== null && body.description !== undefined && typeof body.description !== 'string') {
        errors.description = ['Description must be a string or null.'];
    } else if (typeof body.description === 'string' && body.description.length > 2000) {
        errors.description = ['Description must be 2000 characters or fewer.'];
    }

    if (
        body.trial_days !== null &&
        body.trial_days !== undefined &&
        (!isPositiveInt(body.trial_days) || (body.trial_days as number) < 1 || (body.trial_days as number) > 365)
    ) {
        errors.trial_days = ['Trial days must be an integer between 1 and 365.'];
    }

    if (
        body.monthly_price !== null &&
        body.monthly_price !== undefined &&
        (!isFiniteNumber(body.monthly_price) || (body.monthly_price as number) < 0)
    ) {
        errors.monthly_price = ['Monthly price must be a non-negative number.'];
    }

    if (
        body.yearly_price !== null &&
        body.yearly_price !== undefined &&
        (!isFiniteNumber(body.yearly_price) || (body.yearly_price as number) < 0)
    ) {
        errors.yearly_price = ['Yearly price must be a non-negative number.'];
    }

    if (typeof body.currency !== 'string' || body.currency.length !== 3) {
        errors.currency = ['Currency must be a 3-letter code.'];
    } else if (!ALLOWED_CURRENCIES.includes(body.currency as (typeof ALLOWED_CURRENCIES)[number])) {
        errors.currency = [`Currency must be one of: ${ALLOWED_CURRENCIES.join(', ')}.`];
    }

    if (!isPositiveInt(body.staff_limit) || (body.staff_limit as number) < 1 || (body.staff_limit as number) > 1000) {
        errors.staff_limit = ['Staff limit must be an integer between 1 and 1000.'];
    }

    if (
        !isPositiveInt(body.entry_image_limit) ||
        (body.entry_image_limit as number) < 0 ||
        (body.entry_image_limit as number) > 100
    ) {
        errors.entry_image_limit = ['Entry image limit must be an integer between 0 and 100.'];
    }

    if (!isFiniteNumber(body.upload_max_mb) || (body.upload_max_mb as number) <= 0 || (body.upload_max_mb as number) > 100) {
        errors.upload_max_mb = ['Upload max MB must be a positive number up to 100.'];
    }

    if (
        !isFiniteNumber(body.stored_image_max_mb) ||
        (body.stored_image_max_mb as number) <= 0 ||
        (body.stored_image_max_mb as number) > 9999.99
    ) {
        errors.stored_image_max_mb = ['Stored image max MB must be a positive number up to 9999.99.'];
    }

    if (typeof body.can_export !== 'boolean') {
        errors.can_export = ['Can export flag must be a boolean.'];
    }

    if (typeof body.is_active !== 'boolean') {
        errors.is_active = ['Active flag must be a boolean.'];
    }

    if (
        body.sort_order !== null &&
        body.sort_order !== undefined &&
        (!isPositiveInt(body.sort_order) || (body.sort_order as number) > 1000)
    ) {
        errors.sort_order = ['Sort order must be an integer between 0 and 1000.'];
    }

    // Note: upload_max_mb and stored_image_max_mb are both per-file limits
    // with different semantics (raw upload vs. post-compression target).
    // No cross-field invariant — admins can set them independently.

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        value: {
            name: (body.name as string).trim(),
            description: body.description === undefined || body.description === null
                ? null
                : (body.description as string),
            trial_days: body.trial_days === undefined || body.trial_days === null ? null : (body.trial_days as number),
            monthly_price:
                body.monthly_price === undefined || body.monthly_price === null
                    ? null
                    : (body.monthly_price as number),
            yearly_price:
                body.yearly_price === undefined || body.yearly_price === null
                    ? null
                    : (body.yearly_price as number),
            currency: body.currency as string,
            staff_limit: body.staff_limit as number,
            entry_image_limit: body.entry_image_limit as number,
            upload_max_mb: body.upload_max_mb as number,
            stored_image_max_mb: body.stored_image_max_mb as number,
            can_export: body.can_export as boolean,
            is_active: body.is_active as boolean,
            sort_order: body.sort_order === undefined || body.sort_order === null ? 0 : (body.sort_order as number),
        },
    };
}

function countLiveSubscribers(code: string): number {
    const store = getAdminStore();
    return store.dentists.filter(
        (dentist) =>
            dentist.subscription?.plan === code &&
            LIVE_SUBSCRIPTION_STATUSES.has(dentist.subscription.status),
    ).length;
}

function hasPaidBillingHistory(code: string): boolean {
    const store = getAdminStore();
    return Object.values(store.paymentsByDentist).some((payments) =>
        payments.some((payment) => payment.plan_code === code && payment.status === 'paid'),
    );
}

function countPendingPayments(code: string): number {
    const store = getAdminStore();
    return Object.values(store.paymentsByDentist).reduce(
        (acc, payments) =>
            acc + payments.filter((payment) => payment.plan_code === code && payment.status === 'pending').length,
        0,
    );
}

// Local mock: update a subscription plan's pricing/limits. Mirrors backend
// PlanController invariants — validation, trial integrity guard, active-subscriber
// guard, currency immutability after paid history, and audit logging.
export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { code } = await params;
    const plan = getAdminStore().plans.find((item) => item.code === code);
    if (!plan) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = validate(body);
    if (!result.ok) {
        return fail(result.errors);
    }
    const validated = result.value;

    // Trial integrity: trial plan is the entrypoint for new signups — never let it
    // be deactivated through the editor.
    if (plan.is_trial && !validated.is_active) {
        return fail({ is_active: ['Trial plan cannot be deactivated; new signups depend on it.'] });
    }

    // Block deactivation while live subscribers are still attached.
    if (!validated.is_active) {
        const liveCount = countLiveSubscribers(plan.code);
        if (liveCount > 0) {
            return fail({
                is_active: [
                    `Cannot deactivate plan with ${liveCount} active subscriber${liveCount === 1 ? '' : 's'}. Migrate them first.`,
                ],
            });
        }

        // Mirror backend: pending payments mean a webhook is en route. Block
        // until they settle so the webhook lands on an active plan.
        const pendingCount = countPendingPayments(plan.code);
        if (pendingCount > 0) {
            return fail({
                is_active: [
                    `Cannot deactivate plan with ${pendingCount} pending payment${pendingCount === 1 ? '' : 's'}. Wait for the checkout${pendingCount === 1 ? '' : 's'} to settle.`,
                ],
            });
        }
    }

    // Currency is immutable once real money has changed hands at the old rate.
    if (validated.currency !== plan.currency && hasPaidBillingHistory(plan.code)) {
        return fail({
            currency: ['Currency cannot be changed for a plan that already has paid billing history.'],
        });
    }

    // Plan type invariants — trial is always free, paid plans require both prices.
    if (plan.is_trial) {
        validated.monthly_price = 0;
        validated.yearly_price = 0;
        validated.trial_days = validated.trial_days ?? 30;
    } else {
        validated.trial_days = null;
        if (validated.monthly_price === null || validated.monthly_price <= 0) {
            return fail({ monthly_price: ['Monthly price is required for paid plans.'] });
        }
        if (validated.yearly_price === null || validated.yearly_price <= 0) {
            return fail({ yearly_price: ['Yearly price is required for paid plans.'] });
        }
        if (validated.yearly_price > validated.monthly_price * 12) {
            return fail({ yearly_price: ['Yearly price cannot exceed twelve monthly cycles.'] });
        }
    }

    const before = {
        name: plan.name,
        description: plan.description,
        trial_days: plan.trial_days,
        monthly_price: plan.monthly_price,
        yearly_price: plan.yearly_price,
        currency: plan.currency,
        staff_limit: plan.staff_limit,
        entry_image_limit: plan.entry_image_limit,
        upload_max_mb: plan.upload_max_mb,
        stored_image_max_mb: plan.stored_image_max_mb,
        can_export: plan.can_export,
        is_active: plan.is_active,
        sort_order: plan.sort_order,
    };

    plan.name = validated.name;
    plan.description = validated.description;
    plan.trial_days = validated.trial_days;
    plan.monthly_price = validated.monthly_price;
    plan.yearly_price = validated.yearly_price;
    plan.currency = validated.currency;
    plan.staff_limit = validated.staff_limit;
    plan.entry_image_limit = validated.entry_image_limit;
    plan.upload_max_mb = validated.upload_max_mb;
    plan.stored_image_max_mb = validated.stored_image_max_mb;
    plan.can_export = validated.can_export;
    plan.is_active = validated.is_active;
    plan.sort_order = validated.sort_order;
    plan.updated_at = isoDaysFromNow(0);

    pushAuditEntry({
        eventType: 'admin.plan.updated',
        entityType: 'plan',
        entityId: plan.id,
        metadata: {
            code: plan.code,
            before,
            after: {
                name: plan.name,
                description: plan.description,
                trial_days: plan.trial_days,
                monthly_price: plan.monthly_price,
                yearly_price: plan.yearly_price,
                currency: plan.currency,
                staff_limit: plan.staff_limit,
                entry_image_limit: plan.entry_image_limit,
                upload_max_mb: plan.upload_max_mb,
                stored_image_max_mb: plan.stored_image_max_mb,
                can_export: plan.can_export,
                is_active: plan.is_active,
                sort_order: plan.sort_order,
            },
        },
    });

    return NextResponse.json({ data: plan });
}
