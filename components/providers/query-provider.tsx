'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { registerSubscriptionAccessRevokedHandler } from '@/lib/auth/subscription-access';
import { queryKeys } from '@/lib/query-keys';

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 30_000,
                        refetchOnWindowFocus: false,
                        retry: (failureCount, error) => {
                            if (axios.isAxiosError(error)) {
                                const status = error.response?.status;

                                if (status !== undefined && status >= 400 && status < 500) {
                                    return false;
                                }
                            }

                            return failureCount < 1;
                        },
                    },
                    mutations: {
                        // Mutations must NEVER auto-retry. A POST /billing/checkout
                        // that times out client-side may have succeeded
                        // server-side; an auto-retry would create a second
                        // pending payment and BillingService::createCheckout
                        // only soft-cancels stale pending rows AFTER the
                        // second one runs — race window. Same risk on
                        // patient/appointment/payment creates (duplicate
                        // rows on flaky networks). Defensive default; if a
                        // specific mutation needs retry it should opt in
                        // with idempotency-key handling.
                        retry: false,
                    },
                },
            })
    );

    useEffect(() => {
        // Whenever the axios interceptor detects a 403 with the
        // `subscription_read_only` code (admin revoked / sub expired
        // mid-session), force a refresh of the dentist's auth + billing
        // state so the UI accurately reflects the new access mode. Without
        // this the user sees a stale "full access" indicator until they
        // manually reload.
        return registerSubscriptionAccessRevokedHandler(() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
            queryClient.invalidateQueries({ queryKey: queryKeys.billing.currentSubscription() });
            queryClient.invalidateQueries({ queryKey: queryKeys.billing.payments() });
        });
    }, [queryClient]);

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
