import { FormEvent, useEffect, useMemo, useState } from 'react'
import './App.css'

type DimensionKey = 'D1' | 'D2' | 'D3' | 'D4' | 'D5'
type AnswerValue = string | string[] | number | null
type Scores = Record<DimensionKey, number>

type Option = {
  label: string
  value: string
  score?: number
  exclusive?: boolean
}

type Question = {
  id: string
  number: number
  dimension?: DimensionKey
  title: string
  context: string
  type: 'single' | 'multi' | 'slider'
  options?: Option[]
}

type Answers = Record<string, AnswerValue>

type Industry = {
  label: string
  value: string
  benchmark: number
  products: Record<string, string[]>
  redFlag: (scores: Scores) => string | null
}

const STORAGE_KEY = 'bekuplast-ppwr-audit-v1'
const STORAGE_TTL = 7 * 24 * 60 * 60 * 1000
const deadline = new Date('2026-08-12T00:00:00+02:00')

const scaleLabels: Record<string, string> = {
  small: 'Do 50 osob',
  medium: '51-250 osob',
  large: '251-1000 osob',
  enterprise: 'Powyzej 1000 osob',
}

const industries: Industry[] = [
  {
    label: 'Automotive / motoryzacja',
    value: 'automotive',
    benchmark: 54,
    products: {
      small: ['basicline KLT', 'Euro Norm'],
      medium: ['basicline KLT', 'silverline'],
      large: ['silverline', 'clever move box'],
      enterprise: ['silverline z RFID', 'custom closed-loop'],
    },
    redFlag: (scores) =>
      scores.D3 < 60
        ? 'Tier-1 moga wymagac RTP w nowych kontraktach. Priorytetem jest plan dojscia do 40% reuse.'
        : null,
  },
  {
    label: 'Przetworstwo zywnosci i napojow',
    value: 'food',
    benchmark: 47,
    products: {
      small: ['bakeline'],
      medium: ['bakeline', 'ALC tradeline'],
      large: ['tradeline', 'pojemniki przegrodowe'],
      enterprise: ['tradeline food-grade', 'custom food-grade'],
    },
    redFlag: (scores) =>
      scores.D4 < 60
        ? 'PFAS-ban od 12.08.2026 nie zostawia duzego marginesu. Dokumentacja food-contact wymaga szybkiego przegladu.'
        : null,
  },
  {
    label: 'Farmacja i kosmetyki',
    value: 'pharma',
    benchmark: 59,
    products: {
      small: ['ergline'],
      medium: ['contecline'],
      large: ['contecline', 'custom GMP'],
      enterprise: ['contecline clean-room', 'custom validated'],
    },
    redFlag: (scores) =>
      scores.D5 < 60
        ? 'Farmacja ma dluzszy horyzont dla czesci wymogow, ale odpowiedzialnosc i dokumentacja powinny miec wlasciciela juz teraz.'
        : null,
  },
  {
    label: 'E-commerce / 3PL / fulfillment',
    value: 'ecommerce',
    benchmark: 42,
    products: {
      small: ['lightline'],
      medium: ['lightline', 'composit'],
      large: ['composit', 'skladane pojemniki'],
      enterprise: ['skladane pojemniki', 'pooling'],
    },
    redFlag: (scores) =>
      scores.D4 < 60
        ? 'W dystrybucji i fulfillment compliance przenosi sie wzdluz lancucha. Brak dokumentacji szybko blokuje klientow B2B.'
        : null,
  },
  {
    label: 'FMCG / handel detaliczny',
    value: 'fmcg',
    benchmark: 45,
    products: {
      small: ['basicline'],
      medium: ['basicline', 'pojemniki przegrodowe'],
      large: ['pojemniki przegrodowe', 'pooling'],
      enterprise: ['pooling', 'custom branded'],
    },
    redFlag: (scores) =>
      scores.D3 < 40
        ? 'Sieci handlowe coraz czesciej wpisuja RTP do nowych specyfikacji. Niski reuse jest ryzykiem zakupowym, nie tylko prawnym.'
        : null,
  },
  {
    label: 'Intralogistyka / produkcja przemyslowa',
    value: 'intralogistics',
    benchmark: 51,
    products: {
      small: ['Euro Norm ESD'],
      medium: ['ESD', 'pojemniki transportowe'],
      large: ['pojemniki paletyzowane', 'ESD'],
      enterprise: ['custom rotomoulded', 'closed-loop'],
    },
    redFlag: () => null,
  },
  {
    label: 'Rolnictwo i logistyka rolna',
    value: 'agro',
    benchmark: 38,
    products: {
      small: ['skrzynki ogrodnicze EURO'],
      medium: ['skrzynki EURO', 'palety plastikowe'],
      large: ['palety plastikowe', 'pojemniki skladane'],
      enterprise: ['custom agro', 'closed-loop agro'],
    },
    redFlag: () => null,
  },
  {
    label: 'Inna branza',
    value: 'other',
    benchmark: 44,
    products: {
      small: ['Euro Norm'],
      medium: ['Euro Norm', 'pojemniki skladane'],
      large: ['pojemniki skladane', 'pooling'],
      enterprise: ['custom B2B closed-loop', 'pooling'],
    },
    redFlag: () =>
      'Raport uzywa generycznych rekomendacji. W pelnym wdrozeniu lead z branza "Inna" trafia do recznego przegladu.',
  },
]

const questions: Question[] = [
  {
    id: 'industry',
    number: 1,
    title: 'W jakiej branzy dziala Twoja firma?',
    context:
      'Branza personalizuje interpretacje wyniku, benchmark i rekomendowane linie produktowe.',
    type: 'single',
    options: industries.map(({ label, value }) => ({ label, value })),
  },
  {
    id: 'scale',
    number: 2,
    title: 'Ile osob zatrudnia Twoja firma?',
    context:
      'Skala firmy pomaga odroznic rekomendacje pooling, pilotaz, roll-out i wdrozenie enterprise.',
    type: 'single',
    options: Object.entries(scaleLabels).map(([value, label]) => ({ label, value })),
  },
  {
    id: 'awareness',
    number: 3,
    dimension: 'D1',
    title: 'Co o PPWR wie zespol decyzyjny?',
    context:
      'To rozroznia firmy, ktore potrzebuja edukacji, od tych gotowych do implementacji.',
    type: 'single',
    options: [
      { label: 'Wiemy, ze istnieje, ale szczegolow nie znamy', value: 'a', score: 20 },
      { label: 'Znamy glowne daty i progi: 12.08.2026 oraz 40% reuse w 2030', value: 'b', score: 50 },
      { label: 'Czytalismy rozporzadzenie 2025/40 i znamy art. 5 oraz art. 29', value: 'c', score: 80 },
      { label: 'Mamy eksperta lub kancelarie prowadzaca temat PPWR', value: 'd', score: 100 },
      { label: 'Nie wiem', value: 'unknown', score: 0 },
    ],
  },
  {
    id: 'inventory',
    number: 4,
    dimension: 'D2',
    title: 'Czy masz aktualny wykaz opakowan transportowych?',
    context:
      'Bez wykazu typow, wolumenow, materialow i dostawcow nie da sie wiarygodnie planowac compliance.',
    type: 'single',
    options: [
      { label: 'Tak, pelny wykaz w ERP/BDO/Excel, aktualizowany co kwartal', value: 'a', score: 100 },
      { label: 'Mamy wykaz, ale nie jest aktualizowany regularnie', value: 'b', score: 60 },
      { label: 'Wiemy mniej wiecej, ile czego kupujemy, bez formalnego wykazu', value: 'c', score: 30 },
      { label: 'Nie mamy wykazu, kupujemy ad hoc', value: 'd', score: 0 },
      { label: 'Nie wiem / nie mam dostepu', value: 'unknown', score: 0 },
    ],
  },
  {
    id: 'suppliers',
    number: 5,
    dimension: 'D2',
    title: 'Czy znasz sklad materialowy i obowiazki dostawcow?',
    context:
      'PPWR przenosi czesc odpowiedzialnosci przez lancuch dostaw, dlatego licza sie kontrakty i deklaracje.',
    type: 'multi',
    options: [
      { label: 'Znamy procent materialu z recyklingu', value: 'recycled', score: 25 },
      { label: 'Mamy potwierdzenie wymogow branzowych, np. PFAS/VDA/GMP', value: 'sector', score: 25 },
      { label: 'Mamy zapis o PPWR w kontraktach z dostawcami', value: 'contracts', score: 25 },
      { label: 'Dostawcy zobowiazali sie do deklaracji zgodnosci', value: 'declarations', score: 25 },
      { label: 'Zadne z powyzszych', value: 'none', score: 0, exclusive: true },
      { label: 'Nie wiem / nie mam dostepu', value: 'unknown', score: 0, exclusive: true },
    ],
  },
  {
    id: 'reuse',
    number: 6,
    dimension: 'D3',
    title: 'Jaki procent opakowan transportowych to dzis RTP?',
    context:
      'Cel PPWR na 2030 r. to 40% opakowan transportowych w obiegu zwrotnym. To najwazniejszy twardy fakt w audycie.',
    type: 'slider',
  },
  {
    id: 'investment',
    number: 7,
    dimension: 'D3',
    title: 'Czy masz plan inwestycyjny dla przejscia na RTP?',
    context:
      'Plan i budzet pokazuja, czy firma ma realna sciezke dojscia do wymogow, a nie tylko intencje.',
    type: 'single',
    options: [
      { label: 'Tak, zatwierdzony budzet i harmonogram do 2030 r.', value: 'a', score: 100 },
      { label: 'Mamy plan, ale bez zatwierdzonego budzetu', value: 'b', score: 60 },
      { label: 'Rozpoznajemy temat, ale jeszcze nie planujemy', value: 'c', score: 30 },
      { label: 'Nie planujemy zmian w opakowaniach', value: 'd', score: 0 },
      { label: 'Nie wiem', value: 'unknown', score: 0 },
    ],
  },
  {
    id: 'declaration',
    number: 8,
    dimension: 'D4',
    title: 'Czy jestes gotowy wystawic deklaracje zgodnosci PPWR?',
    context:
      'Deklaracja zgodnosci i dokumentacja techniczna to obowiazki, ktore dotykaja kazdego opakowania wprowadzanego na rynek UE.',
    type: 'single',
    options: [
      { label: 'Tak, mamy procedure, szablon i osobe podpisujaca', value: 'a', score: 100 },
      { label: 'Tak, ale musimy zbudowac proces lub szablon', value: 'b', score: 60 },
      { label: 'Wiemy, ze to obowiazek, ale jeszcze nie zaczelismy', value: 'c', score: 30 },
      { label: 'Nie wiemy, ze to obowiazek', value: 'd', score: 0 },
      { label: 'Nie wiem', value: 'unknown', score: 0 },
    ],
  },
  {
    id: 'marking',
    number: 9,
    dimension: 'D4',
    title: 'Czy opakowania maja oznakowanie zgodne z PPWR?',
    context:
      'Oznakowanie, kod QR i DPP sa malo zrozumiane, ale beda widocznym elementem kontroli zgodnosci.',
    type: 'single',
    options: [
      { label: 'Tak, wszystkie sa oznaczone zgodnie z aktualnymi wytycznymi', value: 'a', score: 100 },
      { label: 'Czesciowo, czesc kategorii jest w trakcie', value: 'b', score: 60 },
      { label: 'Zaczynamy planowac, ale jeszcze nic nie zrobilismy', value: 'c', score: 30 },
      { label: 'Nie zajmujemy sie tym jeszcze', value: 'd', score: 0 },
      { label: 'Nie wiem', value: 'unknown', score: 0 },
    ],
  },
  {
    id: 'owner',
    number: 10,
    dimension: 'D5',
    title: 'Kto odpowiada za przygotowanie do PPWR?',
    context:
      'Brak wlasciciela najczesciej blokuje terminy miedzy logistyka, zakupami, ESG i dzialem prawnym.',
    type: 'single',
    options: [
      { label: 'Dedykowany compliance lead lub team PPWR', value: 'a', score: 100 },
      { label: 'Sustainability / ESG Manager jako jedno z zadan', value: 'b', score: 70 },
      { label: 'Dyrektor Logistyki lub Zakupow', value: 'c', score: 50 },
      { label: 'Nikt formalnie nie odpowiada', value: 'd', score: 10 },
      { label: 'Nie wiem', value: 'unknown', score: 0 },
    ],
  },
]

const dimensionCopy: Record<DimensionKey, { label: string; short: string; action: string }> = {
  D1: {
    label: 'Swiadomosc regulacyjna',
    short: 'Swiadomosc',
    action: 'Ustal wspolny briefing PPWR dla zarzadu, logistyki, zakupow i ESG.',
  },
  D2: {
    label: 'Inwentaryzacja opakowan',
    short: 'Inwentaryzacja',
    action: 'Przeprowadz wykaz typow, wolumenow, materialow i dostawcow per SKU.',
  },
  D3: {
    label: 'Strategia reuse / RTP',
    short: 'Reuse / RTP',
    action: 'Zbuduj plan dojscia do 40% RTP i wybierz pierwsza linie pilotazowa.',
  },
  D4: {
    label: 'Compliance i dokumentacja',
    short: 'Compliance',
    action: 'Przygotuj szablon deklaracji zgodnosci oraz liste brakow w dokumentacji.',
  },
  D5: {
    label: 'Zarzadzanie i budzet',
    short: 'Zarzadzanie',
    action: 'Nadaj tematowi wlasciciela, budzet roboczy i rytm przegladow co 2 tygodnie.',
  },
}

function App() {
  const [step, setStep] = useState<'intro' | 'quiz' | 'loading' | 'result'>('intro')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [pdfSent, setPdfSent] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as {
        createdAt: number
        answers: Answers
        questionIndex: number
        step: 'intro' | 'quiz' | 'loading' | 'result'
      }
      if (Date.now() - parsed.createdAt < STORAGE_TTL) {
        setAnswers(parsed.answers)
        setQuestionIndex(parsed.questionIndex)
        if (parsed.step !== 'loading') setStep(parsed.step)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ createdAt: Date.now(), answers, questionIndex, step }),
    )
  }, [answers, questionIndex, step])

  useEffect(() => {
    document.title = 'Audyt gotowosci PPWR - sprawdz firme w 4 minuty | bekuplast'
    upsertMeta(
      'description',
      'PPWR wchodzi w zycie 12.08.2026. Sprawdz gotowosc firmy w 10 pytaniach. Wynik od razu, raport PDF z 90-dniowym planem dzialania.',
    )
    const schema =
      (document.getElementById('ppwr-schema') as HTMLScriptElement | null) ??
      document.createElement('script')
    schema.id = 'ppwr-schema'
    schema.type = 'application/ld+json'
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: 'Audyt gotowosci PPWR - sprawdz swoja firme w 4 minuty',
          url: 'https://bekuplast.pl/ppwr/audyt-gotowosci/',
          inLanguage: 'pl-PL',
        },
        {
          '@type': 'SoftwareApplication',
          name: 'Audyt gotowosci PPWR',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          offers: { '@type': 'Offer', price: '0' },
        },
        { '@type': 'Quiz', name: 'Audyt gotowosci PPWR', numberOfQuestions: 10, timeRequired: 'PT4M' },
      ],
    })
    document.head.appendChild(schema)
  }, [])

  const currentQuestion = questions[questionIndex]
  const selectedIndustry = industries.find((item) => item.value === answers.industry) ?? industries[0]
  const selectedScale = typeof answers.scale === 'string' ? answers.scale : 'medium'
  const result = useMemo(() => calculateResult(answers), [answers])
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86_400_000))
  const hasAnswer = isAnswered(currentQuestion, answers[currentQuestion.id])

  function startAudit() {
    setQuestionIndex(0)
    setStep('quiz')
    window.history.replaceState(null, '', '?q=1')
  }

  function answerQuestion(value: AnswerValue) {
    setAnswers((current) => ({ ...current, [currentQuestion.id]: value }))
  }

  function nextQuestion() {
    if (!hasAnswer) return
    if (questionIndex === questions.length - 1) {
      setStep('loading')
      window.setTimeout(() => setStep('result'), 1600)
      window.history.replaceState(null, '', '#wynik')
      return
    }
    setQuestionIndex((index) => index + 1)
    window.history.replaceState(null, '', `?q=${questionIndex + 2}`)
  }

  function previousQuestion() {
    if (questionIndex === 0) {
      setStep('intro')
      window.history.replaceState(null, '', window.location.pathname)
      return
    }
    setQuestionIndex((index) => index - 1)
    window.history.replaceState(null, '', `?q=${questionIndex}`)
  }

  function resetAudit() {
    localStorage.removeItem(STORAGE_KEY)
    setAnswers({})
    setQuestionIndex(0)
    setPdfSent(false)
    setStep('intro')
    window.history.replaceState(null, '', window.location.pathname)
  }

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Nawigacja strony audytu">
        <a className="brand" href="/ppwr/">
          <span className="brand__mark" aria-hidden="true" />
          <span>bekuplast PPWR</span>
        </a>
        <nav>
          <a href="/ppwr/">PPWR</a>
          <a href="/ppwr/kalkulator-tco/">Kalkulator TCO</a>
          <a href="/ppwr/faq/">FAQ</a>
        </nav>
      </header>

      {step === 'intro' && (
        <section className="hero" aria-labelledby="page-title">
          <div className="hero__content">
            <p className="eyebrow">Self-assessment B2B</p>
            <h1 id="page-title">Audyt gotowosci PPWR - sprawdz swoja firme w 4 minuty</h1>
            <p className="hero__description">
              PPWR, czyli rozporzadzenie UE 2025/40, wchodzi w zycie 12 sierpnia
              2026 r. Odpowiedz na 10 pytan i zobacz, w ktorych obszarach Twoja
              firma jest gotowa, a gdzie sa luki. Wynik dostajesz od razu na
              ekranie. Pelny raport PDF z 90-dniowym planem dzialania jest
              dostepny za adres e-mail.
            </p>
            <div className="hero__actions">
              <button className="button button--primary" onClick={startAudit}>
                <IconArrow />
                Rozpocznij audyt
              </button>
              <p>Nie musisz zostawiac e-maila, zeby zobaczyc wynik na ekranie.</p>
            </div>
          </div>
          <aside className="hero__panel" aria-label="Najwazniejsze informacje">
            <div className="countdown">
              <span>Do wejscia PPWR</span>
              <strong>{daysLeft}</strong>
              <span>dni</span>
            </div>
            <div className="value-grid">
              <ValueItem title="10 pytan" text="Jedno pytanie na ekran, bez przeciazania formularzem." />
              <ValueItem title="Wynik od razu" text="5 wymiarow, kategoria ogolna i top 3 priorytety." />
              <ValueItem title="Raport PDF" text="Personalizacja pod branze, skale i profil ryzyka." />
            </div>
          </aside>
        </section>
      )}

      {step === 'quiz' && (
        <section className="audit" aria-labelledby="question-title">
          <AuditProgress index={questionIndex} total={questions.length} />
          <div className="question-card">
            <div className="question-card__header">
              <span className="question-pill">Pytanie {currentQuestion.number} z 10</span>
              {currentQuestion.dimension && (
                <span className="dimension-pill">{dimensionCopy[currentQuestion.dimension].short}</span>
              )}
            </div>
            <h2 id="question-title">{currentQuestion.title}</h2>
            <p>{currentQuestion.context}</p>
            <QuestionInput answer={answers[currentQuestion.id]} question={currentQuestion} onAnswer={answerQuestion} />
            <div className="question-card__footer">
              <button className="button button--secondary" onClick={previousQuestion}>
                Wstecz
              </button>
              <button className="button button--primary" disabled={!hasAnswer} onClick={nextQuestion}>
                {questionIndex === questions.length - 1 ? 'Zobacz wynik' : 'Dalej'}
                <IconArrow />
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 'loading' && (
        <section className="loading-panel" aria-live="polite">
          <div className="loader" aria-hidden="true" />
          <h2>Analizujemy Twoje odpowiedzi...</h2>
          <ul>
            <li>Mapujemy odpowiedzi na art. 5 i art. 29 PPWR.</li>
            <li>Porownujemy wynik z profilem branzy {selectedIndustry.label.toLowerCase()}.</li>
            <li>Dobieramy rekomendowane linie produktowe dla skali {scaleLabels[selectedScale]}.</li>
          </ul>
        </section>
      )}

      {step === 'result' && (
        <ResultScreen
          answers={answers}
          industry={selectedIndustry}
          pdfSent={pdfSent}
          result={result}
          scale={selectedScale}
          onPdfSent={() => setPdfSent(true)}
          onReset={resetAudit}
        />
      )}
    </main>
  )
}

function QuestionInput({
  answer,
  onAnswer,
  question,
}: {
  answer: AnswerValue
  onAnswer: (answer: AnswerValue) => void
  question: Question
}) {
  if (question.type === 'slider') {
    const isUnknown = answer === 'unknown'
    const value = typeof answer === 'number' ? answer : 20
    return (
      <div className="slider-block">
        <div className="slider-value">
          <strong>{isUnknown ? 'Nie wiem' : `${value}%`}</strong>
          <span>Cel PPWR 2030: 40%</span>
        </div>
        <div className="range-wrap">
          <input
            aria-label="Procent opakowan RTP"
            disabled={isUnknown}
            max="100"
            min="0"
            onChange={(event) => onAnswer(Number(event.target.value))}
            step="10"
            type="range"
            value={value}
          />
          <span className="target-line" aria-hidden="true" />
        </div>
        <button
          className={`option-card option-card--compact ${isUnknown ? 'is-selected' : ''}`}
          onClick={() => onAnswer(isUnknown ? value : 'unknown')}
          type="button"
        >
          Nie wiem
        </button>
      </div>
    )
  }

  if (question.type === 'multi') {
    const selected = Array.isArray(answer) ? answer : []
    return (
      <div className="options-grid">
        {question.options?.map((option) => {
          const isSelected = selected.includes(option.value)
          return (
            <button
              className={`option-card ${isSelected ? 'is-selected' : ''}`}
              key={option.value}
              onClick={() => {
                if (option.exclusive) {
                  onAnswer(isSelected ? [] : [option.value])
                  return
                }
                const withoutExclusive = selected.filter(
                  (value) => !question.options?.find((item) => item.value === value)?.exclusive,
                )
                onAnswer(
                  isSelected
                    ? withoutExclusive.filter((value) => value !== option.value)
                    : [...withoutExclusive, option.value],
                )
              }}
              type="button"
            >
              <IconCheck />
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="options-grid">
      {question.options?.map((option) => (
        <button
          className={`option-card ${answer === option.value ? 'is-selected' : ''}`}
          key={option.value}
          onClick={() => onAnswer(option.value)}
          type="button"
        >
          <IconCheck />
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ResultScreen({
  answers,
  industry,
  onPdfSent,
  onReset,
  pdfSent,
  result,
  scale,
}: {
  answers: Answers
  industry: Industry
  onPdfSent: () => void
  onReset: () => void
  pdfSent: boolean
  result: ReturnType<typeof calculateResult>
  scale: string
}) {
  const weakDimensions = Object.entries(result.dimensions)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 3) as [DimensionKey, number][]
  const products = industry.products[scale] ?? industry.products.medium
  const redFlag = industry.redFlag(result.dimensions)
  const benchmarkDelta = Math.round(result.total - industry.benchmark)
  const auditId = `AUD-2026-${String(Math.floor(result.total * 137 + Date.now() % 9999)).padStart(4, '0')}`

  function submitPdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onPdfSent()
  }

  return (
    <section className="results" id="wynik" aria-labelledby="result-title">
      <div className="result-hero">
        <div>
          <p className="eyebrow">Wynik audytu {auditId}</p>
          <h2 id="result-title">{result.category.headline}</h2>
          <p>{result.category.description}</p>
        </div>
        <div className="score-orb" aria-label={`Wynik ogolny ${result.total} na 100`}>
          <strong>{result.total}</strong>
          <span>/100</span>
        </div>
      </div>

      <div className="result-grid">
        <section className="panel panel--chart" aria-labelledby="radar-title">
          <div className="section-heading">
            <h3 id="radar-title">5 osi gotowosci</h3>
            <span>{industry.label}</span>
          </div>
          <RadarChart scores={result.dimensions} />
          <div className="dimension-list">
            {(Object.keys(result.dimensions) as DimensionKey[]).map((key) => (
              <div key={key}>
                <span>{dimensionCopy[key].label}</span>
                <strong>{Math.round(result.dimensions[key])}/100</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="benchmark-title">
          <div className="section-heading">
            <h3 id="benchmark-title">Benchmark branzowy</h3>
            <span>
              {benchmarkDelta >= 0 ? '+' : ''}
              {benchmarkDelta} pkt
            </span>
          </div>
          <p>
            Srednia gotowosc w segmencie {industry.label.toLowerCase()} wynosi {industry.benchmark}/100.
            Twoj wynik jest {Math.abs(benchmarkDelta)} punktow {benchmarkDelta >= 0 ? 'wyzej' : 'nizej'}.
          </p>
          {redFlag && <div className="risk-note">{redFlag}</div>}
          <a className="text-link" href="#pdf">Zobacz pelny raport branzowy</a>
        </section>
      </div>

      <section className="panel" aria-labelledby="priorities-title">
        <div className="section-heading">
          <h3 id="priorities-title">Top 3 priorytety na 90 dni</h3>
          <span>Preview planu</span>
        </div>
        <div className="priority-grid">
          {weakDimensions.map(([key], index) => (
            <article className="priority-card" key={key}>
              <span>{index + 1}</span>
              <h4>{dimensionCopy[key].short}</h4>
              <p>{dimensionCopy[key].action}</p>
              <small>Pelny opis w raporcie PDF</small>
            </article>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="products-title">
        <div className="section-heading">
          <h3 id="products-title">Rekomendowane linie bekuplast</h3>
          <span>{scaleLabels[scale]}</span>
        </div>
        <div className="product-grid">
          {products.map((product) => (
            <a className="product-card" href={`/produkty/${slugify(product)}/`} key={product}>
              <span className="product-thumb" aria-hidden="true">
                <IconBox />
              </span>
              <strong>{product}</strong>
              <small>Dopasowane do branzy i skali audytu</small>
            </a>
          ))}
        </div>
      </section>

      <section className="panel pdf-panel" id="pdf" aria-labelledby="pdf-title">
        {pdfSent ? (
          <div className="success-state" role="status">
            <IconCheck />
            <h3>Raport zostal zapisany do wysylki</h3>
            <p>
              W produkcyjnej wersji aplikacji w tym miejscu uruchamiany jest webhook
              CRM, generator PDF oraz sekwencja e-mail nurturing.
            </p>
          </div>
        ) : (
          <>
            <div>
              <p className="eyebrow">PDF za e-mail</p>
              <h3 id="pdf-title">
                Pobierz pelny raport z 90-dniowym planem dla {industry.label.toLowerCase()}
              </h3>
              <p>
                Formularz jest celowo krotki: e-mail sluzbowy, nazwa firmy i
                opcjonalne stanowisko. Wynik na ekranie pozostaje dostepny bez gate.
              </p>
            </div>
            <form className="lead-form" onSubmit={submitPdf}>
              <label>
                E-mail sluzbowy
                <input
                  inputMode="email"
                  placeholder="imie.nazwisko@firma.pl"
                  required
                  type="email"
                />
              </label>
              <label>
                Nazwa firmy
                <input required type="text" placeholder="Nazwa firmy" />
              </label>
              <label>
                Stanowisko
                <input type="text" placeholder="Opcjonalnie" />
              </label>
              <label className="checkbox-row">
                <input defaultChecked type="checkbox" />
                <span>Chce otrzymywac newsletter PPWR od bekuplast.</span>
              </label>
              <small>Dane sluza do wysylki raportu i obslugi zapytania. Szczegoly w polityce prywatnosci.</small>
              <button className="button button--primary" type="submit">
                Wyslij raport PDF na e-mail
                <IconArrow />
              </button>
            </form>
          </>
        )}
      </section>

      <section className="next-steps" aria-label="Nastepne kroki">
        <a className="button button--secondary" href={`/ppwr/kalkulator-tco/?industry=${answers.industry}&scale=${scale}`}>
          Policz koszt w kalkulatorze TCO
        </a>
        <a
          className="button button--secondary"
          href={`/ask-ai/?audit_id=${auditId}&industry=${answers.industry}&category=${encodeURIComponent(result.category.name)}`}
        >
          Zapytaj AI doradce o wynik
        </a>
        <a className="button button--secondary" href="/kontakt/">
          Umow konsultacje readiness
        </a>
        <button className="button button--ghost" onClick={onReset}>
          Rozpocznij nowy audyt
        </button>
      </section>
    </section>
  )
}

function AuditProgress({ index, total }: { index: number; total: number }) {
  const progress = ((index + 1) / total) * 100
  return (
    <div className="progress-shell" aria-label={`Postep: pytanie ${index + 1} z ${total}`}>
      <div className="progress-shell__meta">
        <span>Audyt gotowosci PPWR</span>
        <strong>{Math.round(progress)}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

function RadarChart({ scores }: { scores: Scores }) {
  const keys = Object.keys(scores) as DimensionKey[]
  const center = 120
  const radius = 88
  const points = keys.map((key, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / keys.length
    const valueRadius = (scores[key] / 100) * radius
    return {
      key,
      axisX: center + Math.cos(angle) * radius,
      axisY: center + Math.sin(angle) * radius,
      x: center + Math.cos(angle) * valueRadius,
      y: center + Math.sin(angle) * valueRadius,
    }
  })

  return (
    <svg className="radar" viewBox="0 0 240 240" role="img" aria-label="Wykres radarowy gotowosci PPWR">
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon
          className="radar__grid"
          key={level}
          points={points
            .map((point) => `${center + (point.axisX - center) * level},${center + (point.axisY - center) * level}`)
            .join(' ')}
        />
      ))}
      {points.map((point) => (
        <line className="radar__axis" key={point.key} x1={center} x2={point.axisX} y1={center} y2={point.axisY} />
      ))}
      <polygon className="radar__shape" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
      {points.map((point) => (
        <circle className="radar__dot" cx={point.x} cy={point.y} key={point.key} r="4" />
      ))}
    </svg>
  )
}

function ValueItem({ text, title }: { text: string; title: string }) {
  return (
    <div className="value-item">
      <IconCheck />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

function calculateResult(answers: Answers) {
  const q = (id: string) => scoreQuestion(id, answers[id])
  const dimensions: Scores = {
    D1: q('awareness'),
    D2: (q('inventory') + q('suppliers')) / 2,
    D3: q('reuse') * 0.6 + q('investment') * 0.4,
    D4: q('declaration') * 0.7 + q('marking') * 0.3,
    D5: q('owner'),
  }
  const total = Math.round(
    dimensions.D1 * 0.1 +
      dimensions.D2 * 0.2 +
      dimensions.D3 * 0.3 +
      dimensions.D4 * 0.3 +
      dimensions.D5 * 0.1,
  )
  return { dimensions, total, category: getCategory(total) }
}

function scoreQuestion(id: string, answer: AnswerValue) {
  const question = questions.find((item) => item.id === id)
  if (!question) return 0

  if (id === 'reuse') {
    if (answer === null || answer === undefined) return 30
    if (answer === 'unknown' || typeof answer !== 'number') return 0
    if (answer <= 10) return 10
    if (answer <= 25) return 30
    if (answer <= 40) return 50
    if (answer <= 60) return 70
    return 100
  }

  if (question.type === 'multi') {
    if (!Array.isArray(answer)) return 0
    const selected = question.options?.filter((option) => answer.includes(option.value)) ?? []
    if (selected.some((option) => option.exclusive)) return 0
    return Math.min(100, selected.reduce((sum, option) => sum + (option.score ?? 0), 0))
  }

  return question.options?.find((item) => item.value === answer)?.score ?? 0
}

function getCategory(score: number) {
  if (score <= 24) {
    return {
      name: 'Krytyczna luka',
      headline: 'Krytyczna luka - dzialania konieczne natychmiast',
      description:
        'Twoja firma jest w wysokim ryzyku regulacyjnym. Bez dzialan w najblizszych 90 dniach trudno bedzie zdazyc z compliance do 12.08.2026.',
    }
  }
  if (score <= 44) {
    return {
      name: 'Niska gotowosc',
      headline: 'Niska gotowosc - masz 15 miesiecy',
      description:
        'Rozpoznajesz temat, ale brakuje konkretnych dzialan. Plan startup w 90 dni moze to nadrobic.',
    }
  }
  if (score <= 64) {
    return {
      name: 'Srednia gotowosc',
      headline: 'Srednia gotowosc - solidne podstawy, slabe punkty',
      description: 'Masz wiekszosc elementow, ale 2-3 obszary wymagaja wzmocnienia.',
    }
  }
  if (score <= 84) {
    return {
      name: 'Zaawansowana gotowosc',
      headline: 'Zaawansowana gotowosc - finiszujesz',
      description: 'Jestes na finiszu. Doszlifuj 1-2 obszary i ustaw monitoring.',
    }
  }
  return {
    name: 'Pelna gotowosc',
    headline: 'Pelna gotowosc - mozesz audytowac innych',
    description:
      'Twoja firma moze byc case study. Utrzymaj rytm przegladow i wykorzystaj compliance jako przewage w lancuchu dostaw.',
  }
}

function isAnswered(question: Question, answer: AnswerValue) {
  if (question.type === 'slider') return true
  if (question.type === 'multi') return Array.isArray(answer) && answer.length > 0
  return answer !== null && answer !== undefined && answer !== ''
}

function upsertMeta(name: string, content: string) {
  const meta = document.querySelector(`meta[name="${name}"]`) ?? document.createElement('meta')
  meta.setAttribute('name', name)
  meta.setAttribute('content', content)
  document.head.appendChild(meta)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function IconArrow() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function IconBox() {
  return (
    <svg aria-hidden="true" fill="none" height="38" viewBox="0 0 48 48" width="38">
      <path d="M8 16 24 7l16 9v17L24 42 8 33V16Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2.5" />
      <path d="m8 16 16 9 16-9M24 25v17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </svg>
  )
}

export default App
