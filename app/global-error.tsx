'use client';

import './globals.css';
import { useEffect } from 'react';
import { ErrorScreen, useErrorLocale } from '@/components/error/error-screen';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useErrorLocale();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={locale}>
      <body>
        <ErrorScreen kind="global-error" digest={error.digest} onRetry={reset} localeOverride={locale} />
      </body>
    </html>
  );
}
