'use client';

import './globals.css';
import { useEffect } from 'react';
import { ErrorScreen } from '@/components/error/error-screen';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ru">
      <body>
        <ErrorScreen kind="global-error" digest={error.digest} onRetry={reset} />
      </body>
    </html>
  );
}
