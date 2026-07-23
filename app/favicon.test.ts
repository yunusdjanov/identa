import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();

function readPngSize(filePath: string): { width: number; height: number } {
    const png = readFileSync(filePath);

    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

    return {
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
    };
}

function readIcoSizes(filePath: string): Array<{ width: number; height: number }> {
    const ico = readFileSync(filePath);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const imageCount = ico.readUInt16LE(4);

    return Array.from({ length: imageCount }, (_, index) => {
        const entryOffset = 6 + (index * 16);
        const width = ico.readUInt8(entryOffset) || 256;
        const height = ico.readUInt8(entryOffset + 1) || 256;
        const imageBytes = ico.readUInt32LE(entryOffset + 8);
        const imageOffset = ico.readUInt32LE(entryOffset + 12);

        expect(imageBytes).toBeGreaterThan(0);
        expect(imageOffset + imageBytes).toBeLessThanOrEqual(ico.length);

        return { width, height };
    });
}

describe('app favicon assets', () => {
    it('ships the large app icon and multi-resolution browser favicon', () => {
        const iconPath = join(workspaceRoot, 'app', 'icon.png');
        const faviconPath = join(workspaceRoot, 'app', 'favicon.ico');

        expect(readPngSize(iconPath)).toEqual({ width: 256, height: 256 });
        expect(readIcoSizes(faviconPath)).toEqual([
            { width: 16, height: 16 },
            { width: 32, height: 32 },
            { width: 48, height: 48 },
            { width: 64, height: 64 },
        ]);
    });

    it('keeps root metadata pointed at the generated favicon files', () => {
        const layoutSource = readFileSync(join(workspaceRoot, 'app', 'layout.tsx'), 'utf8');

        expect(layoutSource).toContain('{ url: "/favicon.ico?v=20260709", sizes: "any" }');
        expect(layoutSource).toContain('{ url: "/icon.png?v=20260709", type: "image/png", sizes: "256x256" }');
        expect(layoutSource).toContain('shortcut: "/favicon.ico?v=20260709"');
        expect(layoutSource).toContain('apple: "/icon.png?v=20260709"');
    });
});
