import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Landing } from "@/components/landing/landing";
import { getLandingPlans } from "@/lib/landing/plans";
import {
    LANDING_METADATA,
    LANDING_STRUCTURED_DATA,
} from "@/lib/seo/landing";
import { serializeJsonLd } from "@/lib/seo/site";
import "./landing.css";

// Self-hosted via next/font (no render-blocking Google Fonts request, no
// layout shift). The variables feed the landing's --font-sans/display/mono.
//
// `display: "swap"` keeps cold visits converging to the same final layout as
// cache-warm refreshes. `optional` can permanently keep the first page load on
// fallback fonts, which made the landing look different until a manual refresh.
// RU/UZ copy needs Cyrillic glyphs from Geist; otherwise the biggest hero text
// silently falls back to system fonts while the cached refresh uses a different
// mix of font metrics.
const geist = Geist({
    subsets: ["cyrillic", "latin"],
    variable: "--font-geist",
    display: "swap",
    preload: true,
});
const geistMono = Geist_Mono({
    subsets: ["cyrillic", "latin"],
    variable: "--font-geist-mono",
    display: "swap",
    preload: true,
});
const instrumentSerif = Instrument_Serif({
    subsets: ["latin"],
    weight: "400",
    style: ["normal", "italic"],
    variable: "--font-instrument",
    display: "swap",
    preload: true,
});

export const metadata: Metadata = LANDING_METADATA;

export default async function LandingPage() {
    const fontClassName = `${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`;
    // Pricing limits come from the DB (public plans endpoint) at render time so
    // the landing never drifts from /admin/plans. Falls back to seeded defaults
    // if the API is unreachable.
    const plans = await getLandingPlans();

    return (
        <>
            <Landing fontClassName={fontClassName} plans={plans} />
            {LANDING_STRUCTURED_DATA.map((item) => (
                <script
                    key={item['@type'].toString()}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: serializeJsonLd(item) }}
                />
            ))}
            <noscript>
                <style>{'.identa-landing .reveal{opacity:1;transform:none}'}</style>
            </noscript>
        </>
    );
}
