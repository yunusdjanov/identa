import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { postAuthBroadcast, subscribeAuthBroadcast } from '@/lib/auth/auth-broadcast';

// Minimal BroadcastChannel polyfill — vitest's jsdom env doesn't expose
// it natively. Routes everything through a single in-process registry so
// the publish-from-tab-A → receive-on-tab-B contract can be exercised in
// a single test process (the real cross-tab semantics are guaranteed by
// the browser implementation).
type Listener = (event: MessageEvent) => void;
const channelRegistry: Map<string, Set<{ listeners: Set<Listener>; channel: object }>> = new Map();

class FakeBroadcastChannel {
    readonly name: string;
    private readonly listeners = new Set<Listener>();
    private closed = false;

    constructor(name: string) {
        this.name = name;
        if (!channelRegistry.has(name)) channelRegistry.set(name, new Set());
        channelRegistry.get(name)!.add({ listeners: this.listeners, channel: this });
    }

    postMessage(data: unknown): void {
        if (this.closed) return;
        const subscribers = channelRegistry.get(this.name);
        if (!subscribers) return;
        for (const subscriber of subscribers) {
            // Real BroadcastChannel does NOT echo to the publishing
            // instance — mirror that here.
            if (subscriber.channel === this) continue;
            for (const listener of subscriber.listeners) {
                listener(new MessageEvent('message', { data }));
            }
        }
    }

    addEventListener(type: 'message', listener: Listener): void {
        if (type === 'message') this.listeners.add(listener);
    }

    removeEventListener(type: 'message', listener: Listener): void {
        if (type === 'message') this.listeners.delete(listener);
    }

    close(): void {
        this.closed = true;
        channelRegistry.get(this.name)?.delete({ listeners: this.listeners, channel: this });
    }
}

describe('auth-broadcast', () => {
    beforeEach(() => {
        channelRegistry.clear();
        vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
        // Reset module-internal singleton between tests so each
        // subscribe gets a fresh channel under the polyfill.
        vi.resetModules();
    });

    afterEach(() => {
        channelRegistry.clear();
        vi.unstubAllGlobals();
    });

    it('does not echo messages to the publishing tab', async () => {
        const mod = await import('@/lib/auth/auth-broadcast');
        const handler = vi.fn();
        const unsubscribe = mod.subscribeAuthBroadcast(handler);
        mod.postAuthBroadcast({ type: 'logout' });
        expect(handler).not.toHaveBeenCalled();
        unsubscribe();
    });

    it('delivers messages to subscribers in other tabs', async () => {
        // Simulate two tabs by importing the module twice with a
        // fresh singleton state between them.
        const tabA = await vi.importActual<typeof import('@/lib/auth/auth-broadcast')>(
            '@/lib/auth/auth-broadcast'
        );
        // Force a separate channel for the receiver — mirrors a second
        // browser tab. We achieve this by resetting modules and re-importing.
        vi.resetModules();
        const tabB = await vi.importActual<typeof import('@/lib/auth/auth-broadcast')>(
            '@/lib/auth/auth-broadcast'
        );

        const handler = vi.fn();
        tabB.subscribeAuthBroadcast(handler);
        tabA.postAuthBroadcast({ type: 'logout' });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ type: 'logout' });
    });

    it('handles unsupported environments without throwing', () => {
        // Re-stub BroadcastChannel to undefined to simulate a browser
        // sandbox / private-mode where the API is unavailable.
        vi.stubGlobal('BroadcastChannel', undefined);
        expect(() => postAuthBroadcast({ type: 'logout' })).not.toThrow();
        const unsubscribe = subscribeAuthBroadcast(() => undefined);
        // Should still return a callable cleanup function.
        expect(typeof unsubscribe).toBe('function');
        expect(() => unsubscribe()).not.toThrow();
    });
});
