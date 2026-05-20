// app.jsx — root
const { useState, useEffect } = React;

function App() {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem("identa-lang") || "ru";
    } catch {
      return "ru";
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.setAttribute("data-density", "default");
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  const setLangAndPersist = (l) => {
    setLang(l);
    try {
      localStorage.setItem("identa-lang", l);
    } catch {}
  };

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
        <MobileApp t={t} />
        <Pricing t={t} />
        <Steps t={t} />
        <Faq t={t} />
        <CTA t={t} />
      </main>
      <Footer t={t} />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
