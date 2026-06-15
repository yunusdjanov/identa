'use client';

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
    LANDING_CONTENT,
    LANDING_LOCALES,
    DEFAULT_LANDING_LOCALE,
    type LandingLocale,
    type LandingDictionary,
} from '@/lib/landing/content';
import {
    buildPlanFeatures,
    planPriceLabel,
    FALLBACK_PLANS,
    type LandingPlan,
} from '@/lib/landing/plans';

const APP_LOGIN_URL = '/login';
const APP_REGISTER_URL = '/register';
const LANG_STORAGE_KEY = 'identa-lang';
const LANG_CHANGE_EVENT = 'identa-lang-change';
const DOCUMENT_NAVIGATION_ATTR = 'document';

type AppEntryLinkProps = {
    href: string;
    className: string;
    children: ReactNode;
    style?: CSSProperties;
};

function AppEntryLink({ href, className, children, style }: AppEntryLinkProps) {
    // Full document navigation avoids stale App Router chunks after deploys
    // when a visitor keeps the marketing page open and then enters the app.
    return (
        <a href={href} className={className} style={style} data-navigation={DOCUMENT_NAVIGATION_ATTR}>
            {children}
        </a>
    );
}

// localStorage is the single source of truth for the chosen language, read via
// useSyncExternalStore so the server renders the default locale and the client
// resolves the persisted one without a hydration mismatch or setState-in-effect.
function readStoredLang(): LandingLocale {
    if (typeof window === 'undefined') {
        return DEFAULT_LANDING_LOCALE;
    }
    try {
        const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
        if (stored && (LANDING_LOCALES as readonly string[]).includes(stored)) {
            return stored as LandingLocale;
        }
    } catch {
        // localStorage may be unavailable (private mode) — fall back to default.
    }
    return DEFAULT_LANDING_LOCALE;
}

function subscribeLang(callback: () => void): () => void {
    if (typeof window === 'undefined') {
        return () => undefined;
    }
    window.addEventListener(LANG_CHANGE_EVENT, callback);
    window.addEventListener('storage', callback); // cross-tab sync
    return () => {
        window.removeEventListener(LANG_CHANGE_EVENT, callback);
        window.removeEventListener('storage', callback);
    };
}

function persistLang(l: LandingLocale): void {
    try {
        window.localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
        // ignore write failures (private mode)
    }
    window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
}

type T = LandingDictionary;

function ArrowIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function Brand({ onClick }: { onClick?: () => void }) {
    return (
        <a href="#top" className="brand" aria-label="Identa" onClick={onClick}>
            <span className="brand-mark"><span>i</span></span>
            <span className="brand-name"><b>identa</b><span className="tld">.uz</span></span>
        </a>
    );
}

function LangSwitch({ lang, setLang }: { lang: LandingLocale; setLang: (l: LandingLocale) => void }) {
    return (
        <div className="lang-switch" role="tablist" aria-label="Language">
            {LANDING_LOCALES.map((l) => (
                <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={lang === l}
                    className={lang === l ? 'active' : ''}
                    onClick={() => setLang(l)}
                >
                    {l}
                </button>
            ))}
        </div>
    );
}

function Nav({ t, lang, setLang, onMenu }: { t: T; lang: LandingLocale; setLang: (l: LandingLocale) => void; onMenu: () => void }) {
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);
    return (
        <header className={'nav' + (scrolled ? ' scrolled' : '')}>
            <div className="container nav-row">
                <Brand />
                <nav className="nav-links">
                    <a href="#why">{t.nav.features}</a>
                    {t.nav.mobile ? <a href="#mobile">{t.nav.mobile}</a> : null}
                    <a href="#pricing">{t.nav.pricing}</a>
                    <a href="#steps">{t.nav.howto}</a>
                    <a href="#faq">{t.nav.faq}</a>
                </nav>
                <div className="nav-cta">
                    <LangSwitch lang={lang} setLang={setLang} />
                    <AppEntryLink href={APP_LOGIN_URL} className="btn btn-ghost btn-sm hide-mobile">{t.nav.login}</AppEntryLink>
                    <button className="menu-btn" type="button" onClick={onMenu} aria-label="Open menu">
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </button>
                </div>
            </div>
        </header>
    );
}

function MobileMenu({ open, onClose, t, lang, setLang }: { open: boolean; onClose: () => void; t: T; lang: LandingLocale; setLang: (l: LandingLocale) => void }) {
    return (
        <div className={'mobile-menu' + (open ? ' open' : '')}>
            <div className="mobile-menu-row">
                <Brand onClick={onClose} />
                <button className="menu-btn" type="button" onClick={onClose} style={{ display: 'flex' }} aria-label="Close menu">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
            </div>
            <div className="mobile-links">
                <a href="#why" onClick={onClose}>{t.nav.features}</a>
                {t.nav.mobile ? <a href="#mobile" onClick={onClose}>{t.nav.mobile}</a> : null}
                <a href="#pricing" onClick={onClose}>{t.nav.pricing}</a>
                <a href="#steps" onClick={onClose}>{t.nav.howto}</a>
                <a href="#faq" onClick={onClose}>{t.nav.faq}</a>
            </div>
            <div style={{ marginTop: 32, display: 'flex', gap: 12, alignItems: 'center' }}>
                <LangSwitch lang={lang} setLang={setLang} />
                <AppEntryLink href={APP_LOGIN_URL} className="btn btn-ghost btn-sm">{t.nav.login}</AppEntryLink>
            </div>
        </div>
    );
}

function Calendar({ days, appts }: { days: string[]; appts: { txt: string; c: string }[] }) {
    const hours = ['09', '10', '11', '12', '13', '14'];
    // [hour idx, day idx, label idx, span]
    const layout: [number, number, number, number][] = [
        [0, 0, 0, 1], [1, 1, 1, 2], [3, 0, 2, 1], [4, 2, 3, 1], [2, 3, 4, 2], [0, 4, 0, 1], [4, 4, 1, 1],
    ];
    return (
        <div className="cal">
            <div className="head" />
            {days.map((d, i) => <div key={i} className="head">{d}</div>)}
            {hours.map((h, hi) => (
                <Fragment key={hi}>
                    <div>{h}</div>
                    {days.map((_, di) => {
                        const appt = layout.find(([hh, dd]) => hh === hi && dd === di);
                        return (
                            <div key={di} className="slot">
                                {appt && (
                                    <div
                                        className={'appt ' + appts[appt[2]].c}
                                        style={{ height: appt[3] === 2 ? 'calc(200% + 1px)' : undefined, zIndex: appt[3] === 2 ? 2 : 1 }}
                                    >
                                        {appts[appt[2]].txt}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </Fragment>
            ))}
        </div>
    );
}

function Hero({ t }: { t: T }) {
    const d = t.hero.dash;
    return (
        <section className="hero" id="top">
            <div className="container hero-grid">
                <div>
                    <div className="hero-eyebrow reveal in">
                        <span className="chip"><span className="dot" />{t.hero.status}</span>
                        <span className="eyebrow hide-mobile">{t.hero.eyebrow}</span>
                    </div>
                    <h1 className="h-display reveal in">
                        {t.hero.title[0]}<em>{t.hero.title[1]}</em>{t.hero.title[2]}<em>{t.hero.title[3]}</em>
                    </h1>
                    {t.hero.lede ? <p className="lede reveal in">{t.hero.lede}</p> : null}
                    <div className="hero-actions reveal in">
                        <AppEntryLink href={APP_REGISTER_URL} className="btn btn-primary">
                            {t.hero.ctaPrimary}
                            <ArrowIcon />
                        </AppEntryLink>
                        <AppEntryLink href={APP_LOGIN_URL} className="btn btn-ghost">{t.hero.ctaSecondary}</AppEntryLink>
                    </div>
                </div>

                <div className="hero-preview reveal in">
                    <div className="dash" role="img" aria-label="Identa dashboard mockup">
                        <div className="dash-bar">
                            <div className="dots"><span /><span /><span /></div>
                            <div className="url">app.identa.uz / dashboard</div>
                            <div style={{ width: 46 }} />
                        </div>
                        <div className="dash-body">
                            <aside className="dash-side">
                                <div className="logo"><div className="m">i</div><div className="t">identa</div></div>
                                {d.nav.map((n, i) => (
                                    <div key={i} className={'nav-item' + (i === 0 ? ' active' : '')}>
                                        <span className="ic" aria-hidden="true" />{n}
                                    </div>
                                ))}
                            </aside>
                            <div className="dash-main">
                                <div className="dash-h">
                                    <div className="title">{d.title}</div>
                                    <div className="date">{d.date}</div>
                                </div>
                                <div className="dash-kpis">
                                    {d.kpis.map((k, i) => (
                                        <div key={i} className="kpi">
                                            <div className="l">{k.l}</div>
                                            <div className="v">{k.v}</div>
                                            <div className="d">{k.d}</div>
                                        </div>
                                    ))}
                                </div>
                                <Calendar days={d.days} appts={d.appts} />
                            </div>
                        </div>
                    </div>
                    <div className="dash-float float-1">
                        <div className="av">A</div>
                        <div><strong>{d.float1.name}</strong><em>{d.float1.meta}</em></div>
                    </div>
                    <div className="dash-float float-2">
                        <div className="av" style={{ background: 'var(--navy-800)', color: 'var(--teal-400)' }} aria-hidden="true">
                            <svg width="13" height="13" viewBox="0 0 14 14"><path d="M2 7.5l3.2 3.5L12 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                        <div><strong>{d.float2.name}</strong><em>{d.float2.meta}</em></div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function StatsStrip({ t }: { t: T }) {
    return (
        <section className="stats">
            <div className="container">
                <div className="stats-row">
                    {t.stats.items.map((s, i) => (
                        <div key={i} className="stat-cell reveal">
                            <div className="num">
                                {s.n.split(/(\d+)/).map((part, j) =>
                                    part === '' ? null : /^\d+$/.test(part) ? <span key={j}>{part}</span> : <em key={j}>{part}</em>
                                )}
                            </div>
                            <div className="lbl">{s.l}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function WhyViz({ kind }: { kind: 'schedule' | 'chart' | 'list' }) {
    if (kind === 'schedule') {
        const cells = [
            ['b1', 'b2', '', ''], ['', 'b1', 'b3', ''], ['b2', '', 'b1', 'b1'],
            ['', 'b3', '', 'b2'], ['b1', '', 'b1', ''], ['', 'b2', 'b3', ''], ['b1', 'b1', '', ''],
        ];
        return (
            <div className="visual">
                <div className="viz-schedule">
                    {cells.map((col, i) => (
                        <div key={i} className="col">
                            {col.map((b, j) => <div key={j} className={'blk ' + b} />)}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    if (kind === 'chart') {
        const heights = [38, 56, 42, 70, 60, 84, 72, 92, 76];
        return (
            <div className="visual">
                <div className="viz-chart">
                    {heights.map((h, i) => (
                        <div key={i} className={'bar' + (i === heights.length - 1 ? ' t' : '')} style={{ height: h + '%' }} />
                    ))}
                </div>
            </div>
        );
    }
    if (kind === 'list') {
        return (
            <div className="visual">
                <div className="viz-list">
                    <div className="row"><div className="av" /><div className="ln s" /><div className="ln t" /><div className="ln" /></div>
                    <div className="row"><div className="av" style={{ background: 'var(--navy-700)' }} /><div className="ln s" /><div className="ln" /><div className="ln t" /></div>
                    <div className="row"><div className="av" /><div className="ln s" /><div className="ln" /></div>
                    <div className="row"><div className="av" style={{ background: 'var(--navy-700)' }} /><div className="ln s" /><div className="ln t" /></div>
                </div>
            </div>
        );
    }
    return <div className="visual" />;
}

function Why({ t }: { t: T }) {
    return (
        <section id="why">
            <div className="container">
                <div className="section-head reveal">
                    <div className="eyebrow">{t.why.eyebrow}</div>
                    <h2 className="h-section">{t.why.title[0]}<em>{t.why.title[1]}</em>{t.why.title[2]}</h2>
                    <p className="lede">{t.why.lede}</p>
                </div>
                <div className="why-grid">
                    {t.why.cards.map((c, i) => (
                        <article key={i} className="why-card reveal">
                            <div className="num">{c.n}</div>
                            <h3>{c.t[0]}<em>{c.t[1]}</em></h3>
                            <p>{c.d}</p>
                            <WhyViz kind={c.viz} />
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

function MobileApp({ t }: { t: T }) {
    const m = t.mobile;
    return (
        <section className="mobile-app" id="mobile">
            <div className="container mobile-app-grid">
                <div className="mobile-copy reveal">
                    <div className="eyebrow">{m.eyebrow}</div>
                    <h2 className="h-section">{m.title[0]}<em>{m.title[1]}</em>{m.title[2]}</h2>
                    <p className="lede">{m.lede}</p>
                    <div className="mobile-points">
                        {m.points.map((p, i) => (
                            <div key={i} className="mobile-point">
                                <span>{i + 1}</span>
                                <div>
                                    <strong>{p.t}</strong>
                                    <p>{p.d}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mobile-badges">
                        {m.badges.map((b, i) => <span key={i}>{b}</span>)}
                    </div>
                </div>

                <div className="mobile-visual reveal" role="img" aria-label={m.mockupLabel}>
                    <div className="phone-shell">
                        <div className="phone-top">
                            <span />
                            <strong>Identa</strong>
                        </div>
                        <div className="phone-section">
                            <small>{m.today}</small>
                            <div className="phone-hero-row">
                                <strong>18</strong>
                                <span>{m.appointments}</span>
                            </div>
                        </div>
                        <div className="phone-list">
                            {m.timeline.map((item, i) => (
                                <div key={i} className={'phone-item ' + item.kind}>
                                    <span>{item.time}</span>
                                    <div>
                                        <strong>{item.name}</strong>
                                        <em>{item.meta}</em>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="phone-tabs">
                            {m.tabs.map((tab, i) => <span key={i} className={i === 0 ? 'active' : ''}>{tab}</span>)}
                        </div>
                    </div>
                    <div className="mobile-float-card card-a">
                        <strong>{m.floatA.t}</strong>
                        <span>{m.floatA.d}</span>
                    </div>
                    <div className="mobile-float-card card-b">
                        <strong>{m.floatB.t}</strong>
                        <span>{m.floatB.d}</span>
                    </div>
                </div>
            </div>
        </section>
    );
}

function Pricing({ t, lang, plans }: { t: T; lang: LandingLocale; plans: LandingPlan[] }) {
    const [yearly, setYearly] = useState(false);
    const planByCode = new Map(plans.map((p) => [p.code, p]));
    return (
        <section id="pricing">
            <div className="container">
                <div className="section-head reveal">
                    <div className="eyebrow">{t.pricing.eyebrow}</div>
                    <h2 className="h-section">{t.pricing.title[0]}<em>{t.pricing.title[1]}</em></h2>
                    <p className="lede">{t.pricing.lede}</p>
                    <div className="toggle-bill" role="tablist">
                        <button type="button" className={!yearly ? 'active' : ''} onClick={() => setYearly(false)}>{t.pricing.monthly}</button>
                        <button type="button" className={yearly ? 'active' : ''} onClick={() => setYearly(true)}>
                            {t.pricing.yearly}{t.pricing.save ? <span className="save">{t.pricing.save}</span> : null}
                        </button>
                    </div>
                </div>
                <div className="pricing-grid">
                    {t.pricing.plans.map((p) => {
                        // Limits + price come from the DB plan (falls back to the
                        // seeded defaults if the public plans API was unreachable).
                        const dbPlan = planByCode.get(p.code) ?? FALLBACK_PLANS[p.code];
                        const features = buildPlanFeatures(dbPlan, lang, t.pricing.feature);
                        const price = planPriceLabel(dbPlan, t.pricing.feature, { yearly });
                        return (
                            <div key={p.code} className={'price reveal' + (p.featured ? ' featured' : '')}>
                                {p.flag && <div className="price-flag">{p.flag}</div>}
                                <div className="name">{p.name}</div>
                                <div className="desc">{p.desc}</div>
                                <div className="price-amt">
                                    <em style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '34px' }}>{price.amount}</em>
                                    {price.period && <small>{price.period}</small>}
                                </div>
                                <ul>
                                    {features.map((f, j) => <li key={j}>{f}</li>)}
                                </ul>
                                <AppEntryLink href={APP_REGISTER_URL} className={'btn ' + (p.featured ? 'btn-accent' : 'btn-ghost')}>{p.cta}</AppEntryLink>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

function Steps({ t }: { t: T }) {
    return (
        <section className="steps" id="steps">
            <div className="container">
                <div className="section-head reveal">
                    <div className="eyebrow">{t.steps.eyebrow}</div>
                    <h2 className="h-section">{t.steps.title[0]}<em>{t.steps.title[1]}</em>{t.steps.title[2]}</h2>
                    <p className="lede">{t.steps.lede}</p>
                </div>
                <div className="steps-grid">
                    {t.steps.items.map((s, i) => (
                        <div key={i} className="step reveal">
                            <div className="n">{s.n}</div>
                            <h4>{s.t}</h4>
                            <p>{s.d}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function Faq({ t }: { t: T }) {
    const [open, setOpen] = useState(0);
    return (
        <section id="faq">
            <div className="container">
                <div className="faq-grid">
                    <div className="reveal">
                        <div className="eyebrow" style={{ marginBottom: 14 }}>{t.faq.eyebrow}</div>
                        <h2 className="h-section">{t.faq.title[0]}<em>{t.faq.title[1]}</em>{t.faq.title[2]}</h2>
                        <p className="lede" style={{ marginTop: 20 }}>{t.faq.lede}</p>
                    </div>
                    <div className="faq-list reveal">
                        {t.faq.items.map((it, i) => (
                            <div key={i} className={'faq-item' + (open === i ? ' open' : '')}>
                                <button type="button" className="faq-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                                    <span>{it.q}</span>
                                    <span className="ic" aria-hidden="true">+</span>
                                </button>
                                <div className="faq-a">{it.a}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function CTA({ t }: { t: T }) {
    return (
        <section id="cta">
            <div className="container">
                <div className="cta-card reveal">
                    <div style={{ position: 'relative', zIndex: 2 }}>
                        <h2>{t.cta.title[0]}<em>{t.cta.title[1]}</em>{t.cta.title[2]}</h2>
                        <p>{t.cta.lede}</p>
                    </div>
                    <div className="actions">
                        <AppEntryLink href={APP_REGISTER_URL} className="btn btn-accent">
                            {t.cta.primary}
                            <ArrowIcon />
                        </AppEntryLink>
                        <AppEntryLink href={APP_LOGIN_URL} className="btn btn-ghost" style={{ borderColor: 'oklch(0.4 0.05 230)', color: 'var(--bg)' }}>{t.cta.secondary}</AppEntryLink>
                    </div>
                </div>
            </div>
        </section>
    );
}

function Footer({ t }: { t: T }) {
    return (
        <footer className="footer">
            <div className="container">
                <div className="footer-bottom footer-bottom-simple">
                    <Brand />
                    <div>{t.footer.copy}</div>
                </div>
            </div>
        </footer>
    );
}

export function Landing({ fontClassName = '', plans = [] }: { fontClassName?: string; plans?: LandingPlan[] }) {
    const lang = useSyncExternalStore(subscribeLang, readStoredLang, () => DEFAULT_LANDING_LOCALE);
    const [menuOpen, setMenuOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const setLangAndPersist = (l: LandingLocale) => {
        persistLang(l);
    };

    // Scroll-reveal animation, re-armed whenever the language (and thus the
    // DOM) changes.
    useEffect(() => {
        const els = rootRef.current?.querySelectorAll('.reveal');
        if (!els || els.length === 0) {
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add('in');
                    }
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
        );
        els.forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, [lang]);

    const t = LANDING_CONTENT[lang];

    return (
        <div
            ref={rootRef}
            lang={lang}
            data-theme="light"
            data-density="default"
            className={`identa-landing ${fontClassName}`.trim()}
            style={{
                ['--font-sans' as string]: 'var(--font-geist), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
                ['--font-display' as string]: 'var(--font-instrument), "Iowan Old Style", Georgia, serif',
                ['--font-mono' as string]: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
            }}
        >
            <Nav t={t} lang={lang} setLang={setLangAndPersist} onMenu={() => setMenuOpen(true)} />
            <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} t={t} lang={lang} setLang={setLangAndPersist} />
            <main>
                <Hero t={t} />
                <StatsStrip t={t} />
                <Why t={t} />
                <MobileApp t={t} />
                <Pricing t={t} lang={lang} plans={plans} />
                <Steps t={t} />
                <Faq t={t} />
                <CTA t={t} />
            </main>
            <Footer t={t} />
        </div>
    );
}
