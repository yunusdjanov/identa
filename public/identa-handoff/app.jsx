// app.jsx — root
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lang": "ru",
  "theme": "light",
  "accent": "teal",
  "density": "default"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [lang, setLang] = useState(tweaks.lang || "ru");
  const [menuOpen, setMenuOpen] = useState(false);

  // Apply theme + density on body
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tweaks.theme);
    document.documentElement.setAttribute("data-density", tweaks.density);
    document.documentElement.setAttribute("lang", lang);
  }, [tweaks.theme, tweaks.density, lang]);

  // Accent override
  useEffect(() => {
    const map = {
      teal:  { c500: "oklch(0.72 0.12 195)", c600: "oklch(0.62 0.12 195)", c400: "oklch(0.80 0.10 195)" },
      blue:  { c500: "oklch(0.62 0.15 240)", c600: "oklch(0.52 0.16 240)", c400: "oklch(0.74 0.12 240)" },
      mint:  { c500: "oklch(0.78 0.13 165)", c600: "oklch(0.66 0.13 165)", c400: "oklch(0.84 0.10 165)" },
      coral: { c500: "oklch(0.74 0.13 30)",  c600: "oklch(0.64 0.16 30)",  c400: "oklch(0.82 0.10 30)" },
    };
    const a = map[tweaks.accent] || map.teal;
    document.documentElement.style.setProperty("--teal-500", a.c500);
    document.documentElement.style.setProperty("--teal-600", a.c600);
    document.documentElement.style.setProperty("--teal-400", a.c400);
  }, [tweaks.accent]);

  const setLangAndPersist = (l) => { setLang(l); setTweak("lang", l); };

  // IntersectionObserver reveal
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("in"); });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [lang]);

  const t = window.I18N[lang];

  return (
    <>
      <Nav t={t} lang={lang} setLang={setLangAndPersist} onMenu={() => setMenuOpen(true)} />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} t={t} lang={lang} setLang={setLangAndPersist} />
      <main>
        <Hero t={t} />
        <StatsStrip t={t} />
        <Why t={t} />
        <Pricing t={t} />
        <Steps t={t} />
        <Faq t={t} />
        <CTA t={t} />
      </main>
      <Footer t={t} />

      <TweaksPanel title="Tweaks">
        <TweakSection title="Language">
          <TweakRadio
            value={lang}
            onChange={setLangAndPersist}
            options={[{value:"ru",label:"RU"},{value:"uz",label:"UZ"},{value:"en",label:"EN"}]}
          />
        </TweakSection>
        <TweakSection title="Theme">
          <TweakRadio
            value={tweaks.theme}
            onChange={(v) => setTweak("theme", v)}
            options={[{value:"light",label:"Light"},{value:"warm",label:"Warm"},{value:"dark",label:"Dark"}]}
          />
        </TweakSection>
        <TweakSection title="Accent">
          <TweakRadio
            value={tweaks.accent}
            onChange={(v) => setTweak("accent", v)}
            options={[{value:"teal",label:"Teal"},{value:"blue",label:"Blue"},{value:"mint",label:"Mint"},{value:"coral",label:"Coral"}]}
          />
        </TweakSection>
        <TweakSection title="Density">
          <TweakRadio
            value={tweaks.density}
            onChange={(v) => setTweak("density", v)}
            options={[{value:"default",label:"Roomy"},{value:"cozy",label:"Cozy"}]}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
