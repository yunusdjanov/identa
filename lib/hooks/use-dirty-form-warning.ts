'use client';

import { useEffect } from 'react';

/**
 * Native `beforeunload` warning for forms with pending changes. Pass
 * `isDirty` from the calling form (compared against the loaded server
 * value or a snapshot taken on open). When true, browser shows the
 * "Leave site?" confirmation on tab close / hard navigation.
 *
 * Does NOT cover SPA navigation — Next.js `router.push` is silent by
 * design. For SPA-internal dirty-form prompts add `usePrompt` once
 * Next.js exposes a stable hook.
 *
 * Shared so the dirty-form contract stays consistent across the admin
 * settings page (the first caller — `app/admin/settings/page.tsx:103`),
 * the admin plans editor, and any modal form that needs the same
 * protection. Modern browsers ignore the supplied message string and
 * show their own copy — assigning `returnValue` is what triggers the
 * dialog; the return value is kept for legacy support.
 */
export function useDirtyFormWarning(isDirty: boolean): void {
    useEffect(() => {
        if (!isDirty) return;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
            return '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);
}
