import '@testing-library/jest-dom/vitest';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    writable: true,
});

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverMock,
    writable: true,
});

class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
        return [];
    }
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: IntersectionObserverMock,
    writable: true,
});

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }),
});

if (!HTMLElement.prototype.hasPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
        value: () => false,
        writable: true,
    });
}

if (!HTMLElement.prototype.setPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        value: () => {},
        writable: true,
    });
}

if (!HTMLElement.prototype.releasePointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
        value: () => {},
        writable: true,
    });
}

if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        value: () => {},
        writable: true,
    });
}

let objectUrlCounter = 0;

if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
        value: () => {
            objectUrlCounter += 1;
            return `blob:mock-${objectUrlCounter}`;
        },
        writable: true,
    });
}

if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', {
        value: () => {},
        writable: true,
    });
}
