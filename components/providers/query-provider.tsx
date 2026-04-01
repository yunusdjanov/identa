'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import axios from 'axios';

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
                },
            })
    );

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
