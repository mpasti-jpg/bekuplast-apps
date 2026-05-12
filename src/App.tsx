import './App.css'

function App() {
  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <div className="hero__content">
          <p className="hero__eyebrow">Panel startowy</p>
          <h1 id="page-title">Bekuplast Apps</h1>
          <p className="hero__description">
            Prosta przestrzen do rozwijania aplikacji, narzedzi i procesow
            wspierajacych codzienną prace zespolu Bekuplast.
          </p>
          <div className="hero__actions" aria-label="Najwazniejsze informacje">
            <span>React</span>
            <span>TypeScript</span>
            <span>Vite</span>
          </div>
        </div>
        <aside className="status-panel" aria-label="Status projektu">
          <div>
            <span className="status-panel__label">Status</span>
            <strong>Gotowe do rozwoju</strong>
          </div>
          <p>
            Startowa konfiguracja zawiera szybki build, typowanie i przejrzysta
            strukture plikow.
          </p>
        </aside>
      </section>
    </main>
  )
}

export default App
