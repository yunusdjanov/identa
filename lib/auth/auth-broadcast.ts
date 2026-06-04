'use client';

/**
 * Multi-tab auth sync via BroadcastChannel.
 *
 * Closes the kiosk race window where the user logs out in tab A while
 * tab B is still showing protected UI (or vice versa: logs in on tab B
 * while tab A is at the login screen). Without this, the cookie-shared
 * session diverges from each tab's React Query cache and zustand store
 * for up to one auth/me refetch interval (30s with focus refetch, or
 * indefinitely if both tabs sit idle).
 *
 * Posting is local — BroadcastChannel does NOT echo to the same tab, so
 * the publisher does not re-trigger its own handler. Subscribers in
 * OTHER tabs receive `{ type: 'logout' }` or `{ type: 'login' }` and
 * mirror the state transition.
 *
 * Gracefully degrades:
 *  - SSR (`window === undefined`) → no-op.
 *  - Private-mode browsers / sandboxed iframes where `BroadcastChannel`
 *    is unavailable → no-op.
 *  - postMessage throwing → swallowed.
 */
export type AuthBroadcastMessage =
    | { type: 'logout' }
    | { type: 'login' };

const CHANNEL_NAME = 'identa.auth';

let channelInstance: BroadcastChannel | null = null;
let channelInitFailed = false;

function getChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined') return null;
    if (typeof BroadcastChannel === 'undefined') return null;
    if (channelInitFailed) return null;
    if (channelInstance === null) {
        try {
            channelInstance = new BroadcastChannel(CHANNEL_NAME);
        } catch {
            // Some sandbox / private modes throw on construction; remember
            // so we don't keep trying. Local cleanup still runs.
            channelInitFailed = true;
            return null;
        }
    }
    return channelInstance;
}

export function postAuthBroadcast(message: AuthBroadcastMessage): void {
    try {
        getChannel()?.postMessage(message);
    } catch {
        // Best-effort. Local logout / login flow proceeds independently.
    }
}

// Tracks active listeners so the module-level channel can be `.close()`-ed
// once the last subscriber drops. Without this the channel stays open for
// the lifetime of the SPA — minor leak (one channel per tab) flagged by
// the Phase 10 audit; the close hook also matters for hot-reload during
// dev so the listener count doesn't multiply across reloads.
let listenerCount = 0;

export function subscribeAuthBroadcast(
    handler: (message: AuthBroadcastMessage) => void
): () => void {
    const ch = getChannel();
    if (!ch) return () => undefined;
    const wrapped = (event: MessageEvent<AuthBroadcastMessage>) => {
        try {
            handler(event.data);
        } catch {
            // Handlers must not throw across tabs.
        }
    };
    ch.addEventListener('message', wrapped);
    listenerCount += 1;
    return () => {
        ch.removeEventListener('message', wrapped);
        listenerCount -= 1;
        if (listenerCount <= 0 && channelInstance === ch) {
            // No more subscribers — release the channel. `getChannel()`
            // will lazily reopen one if a new subscriber appears.
            try {
                ch.close();
            } catch {
                // close() can throw on already-closed channels.
            }
            channelInstance = null;
            listenerCount = 0;
        }
    };
}
