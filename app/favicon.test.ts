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

function readSinglePngFromIco(filePath: string): Buffer {
    const ico = readFileSync(filePath);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(1);

    const imageBytes = ico.readUInt32LE(14);
    const imageOffset = ico.readUInt32LE(18);
    const embeddedPng = ico.subarray(imageOffset, imageOffset + imageBytes);

    expect(embeddedPng.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

    return embeddedPng;
}

describe('app favicon assets', () => {
    it('uses the large calendar logo for browser tabs', () => {
        const iconPath = join(workspaceRoot, 'app', 'icon.png');
        const faviconPath = join(workspaceRoot, 'app', 'favicon.ico');
        const iconPng = readFileSync(iconPath);
        const faviconPng = readSinglePngFromIco(faviconPath);

        expect(readPngSize(iconPath)).toEqual({ width: 256, height: 256 });
        expect(faviconPng.equals(iconPng)).toBe(true);
    });

    it('keeps root metadata pointed at the generated favicon files', () => {
        const layoutSource = readFileSync(join(workspaceRoot, 'app', 'layout.tsx'), 'utf8');

        expect(layoutSource).toContain('{ url: "/favicon.ico", sizes: "any" }');
        expect(layoutSource).toContain('{ url: "/icon.png", type: "image/png", sizes: "256x256" }');
        expect(layoutSource).toContain('shortcut: "/favicon.ico"');
        expect(layoutSource).toContain('apple: "/icon.png"');
    });
});
