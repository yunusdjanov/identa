import { ImageResponse } from 'next/og';
import {
    SOCIAL_IMAGE_ALT,
    SOCIAL_IMAGE_SIZE,
} from '@/lib/seo/site';

export const alt = SOCIAL_IMAGE_ALT;
export const size = SOCIAL_IMAGE_SIZE;
export const contentType = 'image/png';

export default function OpenGraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    position: 'relative',
                    overflow: 'hidden',
                    background: '#f4fbfb',
                    color: '#10253f',
                    fontFamily: 'Arial, sans-serif',
                    padding: '72px 80px',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        width: 520,
                        height: 520,
                        borderRadius: 999,
                        right: -100,
                        top: -180,
                        background: '#b9f3ec',
                        opacity: 0.72,
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        width: 380,
                        height: 380,
                        borderRadius: 999,
                        left: -120,
                        bottom: -220,
                        background: '#d9e9ff',
                    }}
                />

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        width: '72%',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 64,
                                height: 64,
                                borderRadius: 20,
                                background: '#13c6b5',
                                color: '#10253f',
                                fontSize: 42,
                                fontWeight: 700,
                            }}
                        >
                            i
                        </div>
                        <div style={{ display: 'flex', fontSize: 42, letterSpacing: -1 }}>
                            <span style={{ fontWeight: 700 }}>identa</span>
                            <span style={{ color: '#0aa99b' }}>.uz</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div
                            style={{
                                display: 'flex',
                                fontSize: 64,
                                lineHeight: 1.05,
                                letterSpacing: -2,
                                fontWeight: 700,
                            }}
                        >
                            Стоматология в одной системе
                        </div>
                        <div style={{ display: 'flex', fontSize: 27, lineHeight: 1.35, color: '#47627e' }}>
                            Пациенты · приёмы · оплаты · сотрудники · клинические снимки
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'absolute',
                        right: 74,
                        bottom: 66,
                        width: 250,
                        height: 250,
                        borderRadius: 56,
                        border: '3px solid #13c6b5',
                        background: 'rgba(255,255,255,0.78)',
                        color: '#0aa99b',
                    }}
                >
                    <svg width="112" height="112" viewBox="0 0 112 112">
                        <path
                            d="M20 58l23 23 49-52"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            </div>
        ),
        size,
    );
}
