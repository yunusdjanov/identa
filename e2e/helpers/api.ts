import { Page } from '@playwright/test';

interface ApiEnvelope<T> {
    data: T;
}

interface ApiCollectionEnvelope<T> {
    data: T[];
}

interface ApiPatient {
    id: string;
}

interface ApiInvoice {
    id: string;
    balance: number | string;
}

function getApiBaseUrl(page: Page): string {
    const host = new URL(page.url()).hostname;
    return `http://${host}:8100/api/v1`;
}

function getBackendBaseUrl(page: Page): string {
    const host = new URL(page.url()).hostname;
    return `http://${host}:8100`;
}

async function apiRequest<T>(
    page: Page,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
): Promise<T> {
    const apiBaseUrl = getApiBaseUrl(page);
    const backendBaseUrl = getBackendBaseUrl(page);

    const response = await page.evaluate(
        async ({ apiBaseUrl: baseUrl, backendBaseUrl: authBaseUrl, requestPath, requestMethod, requestBody }) => {
            const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(requestMethod);
            const commonHeaders = {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            };

            const readXsrfToken = (): string | null => {
                const tokenMatch = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
                return tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
            };

            const execute = async () => {
                if (isMutation) {
                    await fetch(`${authBaseUrl}/sanctum/csrf-cookie`, {
                        method: 'GET',
                        credentials: 'include',
                        headers: commonHeaders,
                    });
                }

                const xsrfToken = isMutation ? readXsrfToken() : null;
                const response = await fetch(`${baseUrl}${requestPath}`, {
                    method: requestMethod,
                    credentials: 'include',
                    headers: {
                        ...commonHeaders,
                        ...(requestBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
                        ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
                    },
                    ...(requestBody !== undefined ? { body: JSON.stringify(requestBody) } : {}),
                });

                return {
                    ok: response.ok,
                    status: response.status,
                    responseText: await response.text(),
                };
            };

            let result = await execute();
            if (isMutation && (result.status === 401 || result.status === 419)) {
                result = await execute();
            }

            return result;
        },
        {
            apiBaseUrl,
            backendBaseUrl,
            requestPath: path,
            requestMethod: method,
            requestBody: body,
        }
    );

    let parsed: unknown = {};
    if (response.responseText) {
        try {
            parsed = JSON.parse(response.responseText);
        }
        catch {
            parsed = {};
        }
    }

    if (!response.ok) {
        const message = (parsed as { message?: string }).message ?? `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    return parsed as T;
}

export async function listPatientsViaApi(page: Page): Promise<ApiPatient[]> {
    const response = await apiRequest<ApiCollectionEnvelope<ApiPatient>>(
        page,
        'GET',
        '/patients?per_page=100&sort=-created_at'
    );

    return response.data;
}

export async function createPatientViaApi(
    page: Page,
    payload: { fullName: string; phone: string }
): Promise<void> {
    await apiRequest<ApiEnvelope<ApiPatient>>(page, 'POST', '/patients', {
        full_name: payload.fullName,
        phone: payload.phone,
    });
}

export async function createAppointmentViaApi(
    page: Page,
    payload: { patientId: string; date: string; startTime: string; reason: string }
): Promise<void> {
    const [hours, minutes] = payload.startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + 30;
    const endHour = Math.floor(totalMinutes / 60);
    const endMinute = totalMinutes % 60;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

    await apiRequest(page, 'POST', '/appointments', {
        patient_id: payload.patientId,
        appointment_date: payload.date,
        start_time: payload.startTime,
        end_time: endTime,
        status: 'scheduled',
        notes: payload.reason,
    });
}

export async function recordOutstandingPaymentViaApi(page: Page): Promise<void> {
    const invoicesResponse = await apiRequest<ApiCollectionEnvelope<ApiInvoice>>(
        page,
        'GET',
        '/invoices?per_page=100&sort=-invoice_date'
    );

    const invoice = invoicesResponse.data.find((candidate) => Number(candidate.balance) > 0);
    if (!invoice) {
        return;
    }

    await apiRequest(page, 'POST', '/payments', {
        invoice_id: invoice.id,
        amount: Number(invoice.balance),
        payment_method: 'cash',
        payment_date: new Date().toISOString().slice(0, 10),
    });
}
