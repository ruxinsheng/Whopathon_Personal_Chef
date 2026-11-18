import { useState, type ChangeEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { detectContext, eventsOnDay, parseIcs, type Ctx, type ParsedCalendar } from '../lib/calendar'
import { BUDGET_MAX, BUDGET_MIN, pickMeals } from '../lib/plan'
import { GROUPS, RECIPES, type Gear, type Recipe } from '../lib/recipes'

export const Route = createFileRoute('/')({ component: Home })

const DISPLAY = "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
const BODY = "'Figtree', ui-sans-serif, system-ui, sans-serif"

// Kept free of quotes and ampersands so it renders safely inside a <style> tag.
const FONT_IMPORTS =
  '@import url(https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800);' +
  '@import url(https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700);' +
  '@media (prefers-reduced-motion: reduce){*{transition:none!important}}'

const FOCUS_LIGHT =
  'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#2B1740]'
const FOCUS_DARK =
  'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#FFD21F]'

const GEAR: { id: Gear; label: string; where: string }[] = [
  { id: 'microwave', label: 'Microwave', where: 'In your room' },
  { id: 'kettle', label: 'Kettle', where: 'In your room' },
  { id: 'toaster', label: 'Toaster', where: 'In your room' },
  { id: 'stove', label: 'Shared stove', where: 'In a shared kitchen' },
]

const gearLabel = (g: Gear) => GEAR.find((x) => x.id === g)!.label

const CONTEXTS: { id: Ctx; label: string; hint: string }[] = [
  { id: 'gym', label: 'Workout', hint: 'Favors higher-protein meals' },
  { id: 'out', label: 'Going out later', hint: 'Favors lighter meals' },
  { id: 'crunch', label: 'Deadline or exam', hint: 'Favors fast, low-effort meals' },
  { id: 'short', label: 'Short on time', hint: 'Favors meals under 10 minutes' },
]

const TAG_LABEL: Record<Exclude<Ctx, 'short'>, string> = {
  gym: 'Workout',
  out: 'Going out',
  crunch: 'Deadline or exam',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const joinList = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const timeLabel = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const shorten = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}...` : s)

function Icon({ name }: { name: Gear }) {
  const common = {
    width: 40,
    height: 40,
    viewBox: '0 0 40 40',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (name === 'microwave') {
    return (
      <svg {...common}>
        <rect x="4" y="9" width="32" height="22" rx="3" />
        <rect x="8" y="13" width="18" height="14" rx="1.5" />
        <circle cx="31" cy="17" r="1.2" fill="currentColor" />
        <circle cx="31" cy="23" r="1.2" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'kettle') {
    return (
      <svg {...common}>
        <path d="M10 32V21a8 8 0 0 1 16 0v11z" />
        <path d="M26 19l7-4" />
        <path d="M10 17c-5 0-5 11 0 11" />
        <circle cx="18" cy="9" r="1.2" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'toaster') {
    return (
      <svg {...common}>
        <rect x="5" y="18" width="30" height="14" rx="4" />
        <path d="M13 18v-5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5" />
        <circle cx="30" cy="25" r="1.2" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M8 17h24v11a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" />
      <path d="M8 21H4M32 21h4" />
      <path d="M11 17c0-3 18-3 18 0" />
      <path d="M16 11c-2-2 2-3 0-6M24 11c-2-2 2-3 0-6" />
    </svg>
  )
}

function Logo({ dot, className = '' }: { dot: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline font-extrabold tracking-tight ${className}`}
      style={{ fontFamily: DISPLAY }}
    >
      hungri
      <span aria-hidden="true" className="ml-[0.06em] inline-block size-[0.24em] rounded-full" style={{ background: dot }} />
    </span>
  )
}

function RecipeRow({ recipe, tone = 'light', notes }: { recipe: Recipe; tone?: 'light' | 'dark'; notes?: string[] }) {
  const dark = tone === 'dark'
  const Heading = dark ? 'h4' : 'h3'
  const gear = recipe.needs.length === 0 ? 'No cook' : recipe.needs.map(gearLabel).join(' + ')
  const chipBg = recipe.needs.length === 0 ? 'bg-[#9BE3B0]' : dark ? 'bg-[#FFD21F]' : 'bg-[#E9E1F5]'
  const muted = dark ? 'text-[#D9CDEB]' : 'text-[#5B4B73]'
  const tags = [
    recipe.protein === 'high' ? 'Higher protein' : '',
    recipe.size === 'light' ? 'Light' : '',
    recipe.size === 'hearty' ? 'Hearty' : '',
  ].filter(Boolean)

  return (
    <li className={`border-t-2 py-6 ${dark ? 'border-[#FFD21F]' : 'border-[#2B1740]'}`}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Heading className="text-2xl leading-tight font-bold sm:text-3xl" style={{ fontFamily: DISPLAY }}>
            {recipe.name}
          </Heading>
          <p className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 ${muted}`}>
            <span className={`rounded-md px-2 py-0.5 text-sm font-bold text-[#2B1740] ${chipBg}`}>{gear}</span>
            {tags.map((t) => (
              <span key={t} className="rounded-md border-2 border-current px-2 py-px text-sm font-semibold">
                {t}
              </span>
            ))}
            <span>{recipe.time}</span>
          </p>
          {notes && notes.length > 0 && (
            <div className="mt-3 space-y-1 font-semibold">
              {notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-4xl leading-none font-extrabold sm:text-5xl" style={{ fontFamily: DISPLAY }}>
            ${recipe.cost.toFixed(2)}
          </span>
          <span className={`text-sm ${muted}`}>per serving</span>
        </p>
      </div>
      <details className="mt-4">
        <summary
          className={`inline-block cursor-pointer text-lg font-bold underline decoration-2 underline-offset-4 ${dark ? FOCUS_DARK : FOCUS_LIGHT}`}
        >
          See recipe
        </summary>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <h5 className="font-bold">You need</h5>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {recipe.ingredients.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h5 className="font-bold">Do this</h5>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {recipe.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </details>
    </li>
  )
}

function Home() {
  const [gear, setGear] = useState<Gear[]>([])
  const [budget, setBudget] = useState(BUDGET_MAX)
  const [shelf, setShelf] = useState<string[]>([])
  const [extra, setExtra] = useState('')
  const [cal, setCal] = useState<ParsedCalendar | null>(null)
  const [calMessage, setCalMessage] = useState('')
  const [day, setDay] = useState<'today' | 'tomorrow'>('today')
  const [override, setOverride] = useState<Partial<Record<Ctx, boolean>>>({})

  const toggleGear = (id: Gear) =>
    setGear((cur) => (cur.includes(id) ? cur.filter((g) => g !== id) : [...cur, id]))
  const toggleItem = (item: string) =>
    setShelf((cur) => (cur.includes(item) ? cur.filter((i) => i !== item) : [...cur, item]))

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    try {
      const parsed = parseIcs(await file.text())
      input.value = ''
      if (parsed.events.length === 0) {
        setCal(null)
        setCalMessage(
          'No events found in that file. Check that it is an .ics calendar export. If you downloaded a .zip, unzip it first.',
        )
      } else {
        setCal(parsed)
        setCalMessage('')
        setOverride({})
      }
    } catch {
      input.value = ''
      setCalMessage('Could not read that file. Try exporting the calendar again.')
    }
  }

  const clearCalendar = () => {
    setCal(null)
    setCalMessage('')
    setOverride({})
  }

  const changeDay = (d: 'today' | 'tomorrow') => {
    setDay(d)
    setOverride({})
  }

  // The calendar only exists in the browser after an import, so this never runs on the server.
  const now = new Date()
  const target = day === 'today' ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const dayEvents = cal ? eventsOnDay(cal.events, target) : []
  const detection = cal ? detectContext(dayEvents, now, day === 'today') : null
  const detected: Record<Ctx, boolean> = detection?.detected ?? { gym: false, out: false, crunch: false, short: false }
  const ctx: Record<Ctx, boolean> = {
    gym: override.gym ?? detected.gym,
    out: override.out ?? detected.out,
    crunch: override.crunch ?? detected.crunch,
    short: override.short ?? detected.short,
  }
  const toggleCtx = (id: Ctx) => setOverride((o) => ({ ...o, [id]: !ctx[id] }))

  const anyBudget = budget >= BUDGET_MAX - 0.001
  const available = RECIPES.filter(
    (r) => (gear.length === 0 || r.needs.every((n) => gear.includes(n))) && (anyBudget || r.cost <= budget + 0.001),
  )

  const budgetText = anyBudget ? '' : ` up to $${budget.toFixed(2)} per serving`
  const summary =
    gear.length === 0 && anyBudget
      ? `Showing all ${RECIPES.length} recipes. Tap what you can cook on, or set a budget, to narrow it down.`
      : available.length === 0
        ? 'No recipes fit that. Raise your budget or tap another appliance.'
        : `${available.length} ${available.length === 1 ? 'recipe' : 'recipes'}${
            gear.length ? ` you can make with your ${joinList(gear.map((g) => gearLabel(g).toLowerCase()))}` : ''
          }${budgetText}.${gear.length ? ' No-cook recipes always count.' : ''}`

  const typed = extra
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3)
  const owned = [...shelf, ...typed]
  const hasInput = CONTEXTS.some((c) => ctx[c.id]) || owned.length > 0
  const picks = hasInput ? pickMeals(available, ctx, owned) : []

  const visibleEvents = detection ? detection.tagged.slice(0, 8) : []
  const hiddenEvents = detection ? Math.max(0, detection.tagged.length - visibleEvents.length) : 0

  return (
    <main className="min-h-screen bg-[#FBFAF7] text-[#2B1740]" style={{ fontFamily: BODY }}>
      <style>{FONT_IMPORTS}</style>

      <header className="bg-[#2B1740] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
          <a href="/" aria-label="Hungri home" className={FOCUS_DARK}>
            <Logo dot="#FFD21F" className="text-3xl" />
          </a>
          <nav className="flex gap-6 font-semibold">
            <a href="#plan" className={`underline-offset-4 hover:underline ${FOCUS_DARK}`}>
              Plan your day
            </a>
            <a href="#recipes" className={`underline-offset-4 hover:underline ${FOCUS_DARK}`}>
              All recipes
            </a>
          </nav>
        </div>
      </header>

      <section className="bg-[#FFD21F]">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:px-10 sm:py-20">
          <h1
            className="max-w-4xl text-5xl leading-[0.95] font-extrabold tracking-tight text-balance sm:text-7xl lg:text-[6.5rem]"
            style={{ fontFamily: DISPLAY }}
          >
            Dinner for rooms with no kitchen.
          </h1>
          <p className="mt-6 max-w-xl text-lg font-medium text-pretty sm:text-xl">
            Tell us what you can cook on, what you can spend and what your day looks like. Hungri picks cheap meals that
            fit.
          </p>

          <div role="group" aria-labelledby="gear-label" className="mt-12">
            <h2 id="gear-label" className="text-2xl font-bold" style={{ fontFamily: DISPLAY }}>
              What can you cook on?
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {GEAR.map((g) => {
                const on = gear.includes(g.id)
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleGear(g.id)}
                    className={`flex flex-col items-start gap-3 rounded-2xl border-[3px] border-[#2B1740] p-4 text-left transition-colors ${
                      on ? 'bg-[#2B1740] text-[#FFD21F]' : 'bg-white text-[#2B1740] hover:bg-[#FFF3B0]'
                    } ${FOCUS_LIGHT}`}
                  >
                    <Icon name={g.id} />
                    <span>
                      <span className="block text-lg leading-tight font-bold">{g.label}</span>
                      <span className={`block text-sm ${on ? 'text-[#FFE680]' : 'text-[#5B4B73]'}`}>{g.where}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-10 max-w-md">
            <label htmlFor="budget" className="block text-2xl font-bold" style={{ fontFamily: DISPLAY }}>
              Budget per serving
            </label>
            <input
              id="budget"
              type="range"
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              step={0.1}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className={`mt-4 block w-full accent-[#2B1740] ${FOCUS_LIGHT}`}
            />
            <p className="mt-2 text-lg font-semibold">{anyBudget ? 'Any budget' : `Up to $${budget.toFixed(2)} per serving`}</p>
          </div>

          <p aria-live="polite" className="mt-8 text-lg font-semibold">
            {summary}
          </p>
          <p className="mt-2 max-w-xl text-sm">
            Many dorms ban hot plates and other appliances. Check your housing rules before you buy anything.
          </p>
        </div>
      </section>

      <section id="plan" className="scroll-mt-0 bg-[#2B1740] text-white">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-20">
          <h2 className="text-4xl leading-none font-extrabold tracking-tight sm:text-5xl" style={{ fontFamily: DISPLAY }}>
            Plan your day
          </h2>
          <p className="mt-4 max-w-xl text-[#D9CDEB]">
            Import your calendar or just tap what applies. Hungri matches meals to your workouts, nights out and
            deadlines, within your budget and appliances.
          </p>

          <div className="mt-10">
            <h3 className="text-2xl font-bold text-[#FFD21F]" style={{ fontFamily: DISPLAY }}>
              Your calendar
            </h3>
            <p className="mt-2 max-w-xl text-[#D9CDEB]">
              Pick an .ics calendar file. It is read in your browser, and nothing is uploaded or saved.
            </p>
            <input
              type="file"
              accept=".ics,text/calendar"
              aria-label="Import a calendar file"
              onChange={onFile}
              className={`mt-4 block max-w-full text-white file:mr-4 file:cursor-pointer file:rounded-xl file:border-0 file:bg-[#FFD21F] file:px-4 file:py-2 file:font-bold file:text-[#2B1740] ${FOCUS_DARK}`}
            />
            <details className="mt-3 max-w-xl">
              <summary className={`inline-block cursor-pointer font-semibold underline underline-offset-4 ${FOCUS_DARK}`}>
                How do I get a calendar file?
              </summary>
              <div className="mt-2 space-y-2 text-[#D9CDEB]">
                <p>
                  Google Calendar on a computer: open Settings, choose Import and export, then Export. Unzip the download
                  and pick the .ics file for your main calendar.
                </p>
                <p>Apple Calendar: choose File, then Export, then Export.</p>
              </div>
            </details>
            <p aria-live="polite" className="mt-3 font-semibold">
              {calMessage}
            </p>

            {cal && detection && (
              <div className="mt-6">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-semibold">Loaded {cal.events.length} events.</p>
                  <button
                    type="button"
                    onClick={clearCalendar}
                    className={`rounded-lg border-2 border-white/40 px-3 py-1 font-semibold hover:border-white ${FOCUS_DARK}`}
                  >
                    Remove calendar
                  </button>
                </div>
                <div className="mt-4 flex gap-2" role="group" aria-label="Which day">
                  {(['today', 'tomorrow'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={day === d}
                      onClick={() => changeDay(d)}
                      className={`rounded-xl border-2 px-4 py-2 font-bold transition-colors ${
                        day === d ? 'border-[#FFD21F] bg-[#FFD21F] text-[#2B1740]' : 'border-white/40 hover:border-white'
                      } ${FOCUS_DARK}`}
                    >
                      {cap(d)}
                    </button>
                  ))}
                </div>
                {visibleEvents.length === 0 ? (
                  <p className="mt-4 text-[#D9CDEB]">
                    {day === 'today' ? 'Nothing left on your calendar today.' : 'Nothing on your calendar tomorrow.'}
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {visibleEvents.map(({ event, tags }, i) => (
                      <li key={`${event.start.getTime()}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="w-24 shrink-0 font-semibold text-[#FFD21F]">
                          {event.allDay ? 'All day' : timeLabel(event.start)}
                        </span>
                        <span>{shorten(event.title)}</span>
                        {tags.map((t) => (
                          <span key={t} className="rounded-md border-2 border-white/60 px-2 py-px text-sm font-semibold">
                            {TAG_LABEL[t]}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
                {hiddenEvents > 0 && <p className="mt-2 text-[#D9CDEB]">And {hiddenEvents} more.</p>}
                {cal.unsupported > 0 && (
                  <p className="mt-3 max-w-xl text-sm text-[#D9CDEB]">
                    {cal.unsupported} monthly or yearly repeating {cal.unsupported === 1 ? 'event shows' : 'events show'} only
                    on {cal.unsupported === 1 ? 'its' : 'their'} first date.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-12" role="group" aria-labelledby="ctx-label">
            <h3 id="ctx-label" className="text-2xl font-bold text-[#FFD21F]" style={{ fontFamily: DISPLAY }}>
              What is coming up?
            </h3>
            <p className="mt-2 max-w-xl text-[#D9CDEB]">
              {cal ? 'We filled these in from your calendar. Tap to change them.' : 'Tap anything that applies.'}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CONTEXTS.map((c) => {
                const on = ctx[c.id]
                const fromCalendar = detected[c.id] && override[c.id] === undefined
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCtx(c.id)}
                    className={`rounded-2xl border-[3px] p-4 text-left transition-colors ${
                      on
                        ? 'border-[#FFD21F] bg-[#FFD21F] text-[#2B1740]'
                        : 'border-white/40 text-white hover:border-white'
                    } ${FOCUS_DARK}`}
                  >
                    <span className="block text-lg leading-tight font-bold">{c.label}</span>
                    <span className={`mt-1 block text-sm ${on ? 'text-[#2B1740]' : 'text-[#D9CDEB]'}`}>
                      {fromCalendar ? 'From your calendar' : c.hint}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-12">
            <h3 className="text-2xl font-bold text-[#FFD21F]" style={{ fontFamily: DISPLAY }}>
              What do you have? <span className="text-base font-normal text-[#D9CDEB]">Optional</span>
            </h3>
            {GROUPS.map((group) => (
              <div key={group.title} className="mt-5">
                <h4 className="font-bold">{group.title}</h4>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {group.items.map((item) => {
                    const on = shelf.includes(item)
                    return (
                      <li key={item}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleItem(item)}
                          className={`rounded-full border-2 px-4 py-2 font-semibold transition-colors ${
                            on
                              ? 'border-[#FFD21F] bg-[#FFD21F] text-[#2B1740]'
                              : 'border-white/40 text-white hover:border-white'
                          } ${FOCUS_DARK}`}
                        >
                          {cap(item)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            <label htmlFor="extra" className="mt-6 block font-bold">
              Anything else? <span className="font-normal text-[#D9CDEB]">Separate items with commas.</span>
            </label>
            <input
              id="extra"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="spinach, tuna, hot sauce"
              className={`mt-3 w-full max-w-xl rounded-xl border-2 border-white/40 bg-transparent px-4 py-3 text-lg text-white placeholder:text-white/60 ${FOCUS_DARK}`}
            />
          </div>

          <h3 className="mt-16 text-3xl font-extrabold sm:text-4xl" style={{ fontFamily: DISPLAY }}>
            Your picks
          </h3>
          {ctx.out && (
            <p className="mt-3 max-w-xl text-[#D9CDEB]">
              Going out? A light meal beats an empty stomach, especially if you will be drinking.
            </p>
          )}
          {!hasInput ? (
            <p className="mt-3 max-w-xl text-[#D9CDEB]">
              Tap what applies today, or add what you have, and your picks show up here.
            </p>
          ) : available.length === 0 ? (
            <p className="mt-3 max-w-xl text-[#D9CDEB]">
              Nothing fits that budget with your appliances. Raise the budget or tap another appliance.
            </p>
          ) : (
            <ul className="mt-4 border-b-2 border-[#FFD21F]">
              {picks.map((p) => (
                <RecipeRow
                  key={p.recipe.name}
                  recipe={p.recipe}
                  tone="dark"
                  notes={[...p.reasons, p.missing.length > 0 ? `Missing: ${p.missing.join(', ')}.` : '']}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section id="recipes" className="mx-auto max-w-6xl scroll-mt-4 px-6 py-16 sm:px-10 sm:py-20">
        <h2 className="text-4xl leading-none font-extrabold tracking-tight sm:text-5xl" style={{ fontFamily: DISPLAY }}>
          All recipes
        </h2>
        <p className="mt-4 max-w-xl text-[#5B4B73]">
          Filtered by your appliances and budget above. Microwave times are a starting point. Dorm microwaves vary in
          power, so add time in short bursts until the food is steaming hot all the way through.
        </p>
        {available.length === 0 ? (
          <p className="mt-8 text-lg font-semibold">Nothing fits yet. Raise your budget or tap another appliance.</p>
        ) : (
          <ul className="mt-8 border-b-2 border-[#2B1740]">
            {available.map((r) => (
              <RecipeRow key={r.name} recipe={r} />
            ))}
          </ul>
        )}
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <Logo dot="#E8433A" className="text-3xl text-[#2B1740]" />
        <p className="mt-4 max-w-xl text-sm text-[#5B4B73]">
          Recipe ideas are AI-generated starting points. Costs, protein and portion tags are rough estimates, not
          nutrition advice. Cook eggs, rice and leftovers until they are steaming hot all the way through.
        </p>
      </footer>
    </main>
  )
}
