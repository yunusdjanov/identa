// components.jsx — UI section components for Identa landing
const { useState, useEffect, useRef } = React;
const APP_LOGIN_URL = "/login";
const APP_REGISTER_URL = "/register";
const TOP_TARGET = "_top";

/* ============ NAV ============ */
function Nav({ t, lang, setLang, onMenu }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={"nav" + (scrolled ? " scrolled" : "")}>
      <div className="container nav-row">
        <a href="#top" className="brand" aria-label="Identa">
          <span className="brand-mark"><span>i</span></span>
          <span className="brand-name"><b>identa</b><span className="tld">.uz</span></span>
        </a>
        <nav className="nav-links">
          <a href="#why">{t.nav.features}</a>
          {t.nav.mobile ? <a href="#mobile">{t.nav.mobile}</a> : null}
          <a href="#pricing">{t.nav.pricing}</a>
          <a href="#steps">{t.nav.howto}</a>
          <a href="#faq">{t.nav.faq}</a>
        </nav>
        <div className="nav-cta">
          <div className="lang-switch" role="tablist" aria-label="Language">
            {["ru", "uz", "en"].map(l => (
              <button key={l} className={lang === l ? "active" : ""} onClick={() => setLang(l)}>{l}</button>
            ))}
          </div>
          <a href={APP_LOGIN_URL} target={TOP_TARGET} className="btn btn-ghost btn-sm hide-mobile">{t.nav.login}</a>
          <button className="menu-btn" onClick={onMenu} aria-label="Open menu">
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ open, onClose, t, lang, setLang }) {
  return (
    <div className={"mobile-menu" + (open ? " open" : "")}>
      <div className="mobile-menu-row">
        <a href="#top" className="brand" onClick={onClose}>
          <span className="brand-mark"><span>i</span></span>
          <span className="brand-name"><b>identa</b><span className="tld">.uz</span></span>
        </a>
        <button className="menu-btn" onClick={onClose} style={{display:"flex"}} aria-label="Close menu">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
      <div className="mobile-links">
        <a href="#why" onClick={onClose}>{t.nav.features}</a>
        {t.nav.mobile ? <a href="#mobile" onClick={onClose}>{t.nav.mobile}</a> : null}
        <a href="#pricing" onClick={onClose}>{t.nav.pricing}</a>
        <a href="#steps" onClick={onClose}>{t.nav.howto}</a>
        <a href="#faq" onClick={onClose}>{t.nav.faq}</a>
      </div>
      <div style={{marginTop: 32, display:"flex", gap: 12, alignItems:"center"}}>
        <div className="lang-switch">
          {["ru","uz","en"].map(l => (
            <button key={l} className={lang === l ? "active" : ""} onClick={() => setLang(l)}>{l}</button>
          ))}
        </div>
        <a href={APP_LOGIN_URL} target={TOP_TARGET} className="btn btn-ghost btn-sm">{t.nav.login}</a>
      </div>
    </div>
  );
}

/* ============ HERO ============ */
function Hero({ t }) {
  const d = t.hero.dash;
  const [hl] = useState(0);
  const navIcons = ["▦","▢","◌","◐","◇","▤"];
  return (
    <section className="hero" id="top">
      <div className="container hero-grid">
        <div>
          <div className="hero-eyebrow reveal in">
            <span className="chip"><span className="dot"></span>{t.hero.status}</span>
            <span className="eyebrow hide-mobile">{t.hero.eyebrow}</span>
          </div>
          <h1 className="h-display reveal in">
            {t.hero.title[0]}<em>{t.hero.title[1]}</em>{t.hero.title[2]}<em>{t.hero.title[3]}</em>
          </h1>
          {t.hero.lede ? <p className="lede reveal in">{t.hero.lede}</p> : null}
          <div className="hero-actions reveal in">
            <a href={APP_REGISTER_URL} target={TOP_TARGET} className="btn btn-primary">
              {t.hero.ctaPrimary}
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
            <a href={APP_LOGIN_URL} target={TOP_TARGET} className="btn btn-ghost">{t.hero.ctaSecondary}</a>
          </div>
        </div>

        <div className="hero-preview reveal in">
          <div className="dash" role="img" aria-label="Identa dashboard mockup">
            <div className="dash-bar">
              <div className="dots"><span/><span/><span/></div>
              <div className="url">app.identa.uz / dashboard</div>
              <div style={{width:46}}/>
            </div>
            <div className="dash-body">
              <aside className="dash-side">
                <div className="logo"><div className="m">i</div><div className="t">identa</div></div>
                {d.nav.map((n, i) => (
                  <div key={i} className={"nav-item" + (i === 0 ? " active" : "")}>
                    <span className="ic" aria-hidden="true"></span>{n}
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
            <div className="av" style={{background:"var(--navy-800)", color:"var(--teal-400)"}}>₽</div>
            <div><strong>{d.float2.name}</strong><em>{d.float2.meta}</em></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Calendar({ days, appts }) {
  // Simple grid: hours rows × day cols, with appointments hard-coded
  const hours = ["09", "10", "11", "12", "13", "14"];
  const layout = [
    // [hour idx, day idx, label idx, span]
    [0, 0, 0, 1],
    [1, 1, 1, 2],
    [3, 0, 2, 1],
    [4, 2, 3, 1],
    [2, 3, 4, 2],
    [0, 4, 0, 1],
    [4, 4, 1, 1],
  ];
  return (
    <div className="cal">
      <div className="head"></div>
      {days.map((d, i) => <div key={i} className="head">{d}</div>)}
      {hours.map((h, hi) => (
        <React.Fragment key={hi}>
          <div>{h}</div>
          {days.map((_, di) => {
            const appt = layout.find(([hh, dd]) => hh === hi && dd === di);
            return (
              <div key={di} className="slot">
                {appt && (
                  <div
                    className={"appt " + appts[appt[2]].c}
                    style={{ height: appt[3] === 2 ? "calc(200% + 1px)" : undefined, zIndex: appt[3] === 2 ? 2 : 1 }}
                  >
                    {appts[appt[2]].txt}
                  </div>
                )}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ============ STATS STRIP ============ */
function StatsStrip({ t }) {
  return (
    <section className="stats">
      <div className="container">
        <div className="stats-row">
          {t.stats.items.map((s, i) => (
            <div key={i} className="stat-cell reveal">
              <div className="num">{s.n.split(/(\d+)/).map((part, j) =>
                isNaN(part) || part === "" ? <em key={j}>{part}</em> : <span key={j}>{part}</span>
              )}</div>
              <div className="lbl">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ WHY ============ */
function WhyViz({ kind }) {
  if (kind === "schedule") {
    const cells = [
      ["b1","b2","",""], ["","b1","b3",""], ["b2","","b1","b1"],
      ["","b3","","b2"], ["b1","","b1",""], ["","b2","b3",""], ["b1","b1","",""],
    ];
    return (
      <div className="visual">
        <div className="viz-schedule">
          {cells.map((col, i) => (
            <div key={i} className="col">
              {col.map((b, j) => <div key={j} className={"blk " + b}></div>)}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "chart") {
    const heights = [38, 56, 42, 70, 60, 84, 72, 92, 76];
    return (
      <div className="visual">
        <div className="viz-chart">
          {heights.map((h, i) => (
            <div key={i} className={"bar" + (i === heights.length - 1 ? " t" : "")} style={{height: h + "%"}}></div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "list") {
    return (
      <div className="visual">
        <div className="viz-list">
          <div className="row"><div className="av"></div><div className="ln s"></div><div className="ln t"></div><div className="ln"></div></div>
          <div className="row"><div className="av" style={{background:"var(--navy-700)"}}></div><div className="ln s"></div><div className="ln"></div><div className="ln t"></div></div>
          <div className="row"><div className="av"></div><div className="ln s"></div><div className="ln"></div></div>
          <div className="row"><div className="av" style={{background:"var(--navy-700)"}}></div><div className="ln s"></div><div className="ln t"></div></div>
        </div>
      </div>
    );
  }
  return <div className="visual"></div>;
}

function Why({ t }) {
  return (
    <section id="why">
      <div className="container">
        <div className="section-head reveal">
          <div className="eyebrow">{t.why.eyebrow}</div>
          <h2 className="h-section">
            {t.why.title[0]}<em>{t.why.title[1]}</em>{t.why.title[2]}
          </h2>
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

/* ============ MOBILE APP ============ */
function MobileApp({ t }) {
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
              <span></span>
              <strong>Identa</strong>
              <em>{m.status}</em>
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
                <div key={i} className={"phone-item " + item.kind}>
                  <span>{item.time}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <em>{item.meta}</em>
                  </div>
                </div>
              ))}
            </div>
            <div className="phone-tabs">
              {m.tabs.map((tab, i) => <span key={i} className={i === 0 ? "active" : ""}>{tab}</span>)}
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

/* ============ PRICING ============ */
function Pricing({ t }) {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="pricing">
      <div className="container">
        <div className="section-head reveal">
          <div className="eyebrow">{t.pricing.eyebrow}</div>
          <h2 className="h-section">{t.pricing.title[0]}<em>{t.pricing.title[1]}</em></h2>
          <p className="lede">{t.pricing.lede}</p>
          <div className="toggle-bill" role="tablist">
            <button className={!yearly ? "active" : ""} onClick={() => setYearly(false)}>{t.pricing.monthly}</button>
            <button className={yearly ? "active" : ""} onClick={() => setYearly(true)}>{t.pricing.yearly}{t.pricing.save ? <span className="save">{t.pricing.save}</span> : null}</button>
          </div>
        </div>
        <div className="pricing-grid">
          {t.pricing.plans.map((p, i) => {
            const price = yearly ? p.price.y : p.price.m;
            const isText = isNaN(parseInt(price.replace(/[\s,]/g, ""), 10));
            return (
              <div key={i} className={"price reveal" + (p.featured ? " featured" : "")}>
                {p.flag && <div className="price-flag">{p.flag}</div>}
                <div className="name">{p.name}</div>
                <div className="desc">{p.desc}</div>
                <div className="price-amt">
                  {isText ? <em style={{fontFamily:"var(--font-display)", fontStyle:"italic", fontSize:"34px"}}>{price}</em> : <>{price}<small>{p.cur}</small></>}
                </div>
                <ul>
                  {p.features.map((f, j) => <li key={j}>{f}</li>)}
                </ul>
                <a href={APP_REGISTER_URL} target={TOP_TARGET} className={"btn " + (p.featured ? "btn-accent" : "btn-ghost")}>{p.cta}</a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============ STEPS ============ */
function Steps({ t }) {
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

/* ============ FAQ ============ */
function Faq({ t }) {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq">
      <div className="container">
        <div className="faq-grid">
          <div className="reveal">
            <div className="eyebrow" style={{marginBottom:14}}>{t.faq.eyebrow}</div>
            <h2 className="h-section">{t.faq.title[0]}<em>{t.faq.title[1]}</em>{t.faq.title[2]}</h2>
            <p className="lede" style={{marginTop:20}}>{t.faq.lede}</p>
          </div>
          <div className="faq-list reveal">
            {t.faq.items.map((it, i) => (
              <div key={i} className={"faq-item" + (open === i ? " open" : "")} onClick={() => setOpen(open === i ? -1 : i)}>
                <div className="faq-q">
                  <span>{it.q}</span>
                  <span className="ic">+</span>
                </div>
                <div className="faq-a">{it.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============ CTA ============ */
function CTA({ t }) {
  return (
    <section id="cta">
      <div className="container">
        <div className="cta-card reveal">
          <div style={{position:"relative", zIndex:2}}>
            <h2>{t.cta.title[0]}<em>{t.cta.title[1]}</em>{t.cta.title[2]}</h2>
            <p>{t.cta.lede}</p>
          </div>
          <div className="actions">
            <a href={APP_REGISTER_URL} target={TOP_TARGET} className="btn btn-accent">
              {t.cta.primary}
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
            <a href={APP_LOGIN_URL} target={TOP_TARGET} className="btn btn-ghost" style={{borderColor:"oklch(0.4 0.05 230)", color:"var(--bg)"}}>{t.cta.secondary}</a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============ FOOTER ============ */
function Footer({ t }) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-bottom footer-bottom-simple">
          <a href="#top" className="brand">
            <span className="brand-mark"><span>i</span></span>
            <span className="brand-name"><b>identa</b><span className="tld">.uz</span></span>
          </a>
          <div>{t.footer.copy}</div>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Nav, MobileMenu, Hero, StatsStrip, Why, MobileApp, Pricing, Steps, Faq, CTA, Footer });
