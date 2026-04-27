'use client';

import { useEffect } from 'react';
import { ErrorScreen } from '@/components/error/error-screen';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorScreen kind="route-error" digest={error.digest} onRetry={reset} />;
}
