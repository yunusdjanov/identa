'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

interface GoogleCredentialResponse {
    credential?: string;
}

interface GoogleAccountsId {
    initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
    }) => void;
    renderButton: (
        parent: HTMLElement,
        options: {
            theme: 'outline';
            size: 'large';
            type: 'standard';
            text: 'continue_with';
            shape: 'pill';
            logo_alignment: 'left';
            locale: string;
            width: number;
        }
    ) => void;
}

declare global {
    interface Window {
        google?: {
            accounts?: {
                id?: GoogleAccountsId;
            };
        };
    }
}

const GOOGLE_GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GOOGLE_GSI_SCRIPT_SELECTOR = `script[src="${GOOGLE_GSI_SCRIPT_URL}"]`;
const GOOGLE_LOAD_TIMEOUT_MS = 5_000;
const GOOGLE_LOAD_POLL_INTERVAL_MS = 100;

interface UseGoogleIdentityButtonOptions {
    clientId: string;
    enabled?: boolean;
    locale: string;
    mountRef: RefObject<HTMLDivElement | null>;
    onCredential: (credential: string | null) => void;
    onLoadError: () => void;
}

export function useGoogleIdentityButton({
    clientId,
    enabled = true,
    locale,
    mountRef,
    onCredential,
    onLoadError,
}: UseGoogleIdentityButtonOptions) {
    const initializedRef = useRef(false);
    const onCredentialRef = useRef(onCredential);
    const onLoadErrorRef = useRef(onLoadError);
    const [isLoadRequested, setIsLoadRequested] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [hasLoadError, setHasLoadError] = useState(false);

    useEffect(() => {
        onCredentialRef.current = onCredential;
        onLoadErrorRef.current = onLoadError;
    }, [onCredential, onLoadError]);

    const requestLoad = useCallback(() => {
        setHasLoadError(false);
        setIsReady(false);
        setIsLoadRequested(true);
    }, []);

    useEffect(() => {
        if (!clientId || !enabled || typeof window === 'undefined' || !isLoadRequested) {
            return;
        }

        const existingScript = document.querySelector<HTMLScriptElement>(GOOGLE_GSI_SCRIPT_SELECTOR);
        let pollHandle = 0;
        let cancelled = false;
        const loadStartedAt = Date.now();

        const failLoad = () => {
            if (cancelled) return;
            window.clearTimeout(pollHandle);
            document.querySelector<HTMLScriptElement>(GOOGLE_GSI_SCRIPT_SELECTOR)?.remove();
            setIsReady(false);
            setHasLoadError(true);
            setIsLoadRequested(false);
            onLoadErrorRef.current();
        };

        const initializeAndRender = () => {
            if (cancelled) return;
            const googleId = window.google?.accounts?.id;
            const mountNode = mountRef.current;
            if (!googleId || !mountNode) {
                if (Date.now() - loadStartedAt >= GOOGLE_LOAD_TIMEOUT_MS) {
                    failLoad();
                    return;
                }
                pollHandle = window.setTimeout(initializeAndRender, GOOGLE_LOAD_POLL_INTERVAL_MS);
                return;
            }

            if (!initializedRef.current) {
                try {
                    googleId.initialize({
                        client_id: clientId,
                        callback: (response) => onCredentialRef.current(response.credential ?? null),
                    });
                    initializedRef.current = true;
                } catch {
                    failLoad();
                    return;
                }
            }

            try {
                mountNode.innerHTML = '';
                googleId.renderButton(mountNode, {
                    theme: 'outline',
                    size: 'large',
                    type: 'standard',
                    text: 'continue_with',
                    shape: 'pill',
                    locale,
                    logo_alignment: 'left',
                    width: Math.max(240, Math.min(400, Math.floor(mountNode.getBoundingClientRect().width || 400))),
                });
            } catch {
                failLoad();
                return;
            }

            setHasLoadError(false);
            setIsReady(true);
        };

        const script = existingScript ?? document.createElement('script');
        script.addEventListener('load', initializeAndRender);
        script.addEventListener('error', failLoad);

        if (existingScript) {
            initializeAndRender();
        } else {
            script.src = GOOGLE_GSI_SCRIPT_URL;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }

        return () => {
            cancelled = true;
            window.clearTimeout(pollHandle);
            script.removeEventListener('load', initializeAndRender);
            script.removeEventListener('error', failLoad);
        };
    }, [clientId, enabled, isLoadRequested, locale, mountRef]);

    return { hasLoadError, isLoadRequested, isReady, requestLoad };
}
