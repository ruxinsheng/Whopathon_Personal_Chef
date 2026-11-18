// Reads an .ics calendar file entirely in the browser. Nothing is uploaded or stored.

export type Ctx = 'gym' | 'out' | 'crunch' | 'short'

export type DayEvent = { title: string; start: Date; end: Date; allDay: boolean }

type Rule = { freq: 'DAILY' | 'WEEKLY'; interval: number; byday: number[]; until?: Date; count?: number }

export type CalendarEvent = {
  uid: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  rule?: Rule
  exdates: Set<string>
  recurrenceId?: string
}

export type ParsedCalendar = { events: CalendarEvent[]; unsupported: number }

const DAY = 24 * 60 * 60 * 1000
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

function zonedToDate(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date | null {
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s)
    const off1 = tzOffsetMs(tz, new Date(guess))
    let t = guess - off1
    const off2 = tzOffsetMs(tz, new Date(t))
    if (off2 !== off1) t = guess - off2
    return new Date(t)
  } catch {
    return null
  }
}

function parseDate(value: string, params: Record<string, string>): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const Y = +m[1]
  const M = +m[2]
  const D = +m[3]
  if (m[4] === undefined || (params.VALUE || '').toUpperCase() === 'DATE') {
    return { date: new Date(Y, M - 1, D), allDay: true }
  }
  const H = +m[4]
  const MI = +m[5]
  const S = +(m[6] ?? 0)
  if (m[7]) return { date: new Date(Date.UTC(Y, M - 1, D, H, MI, S)), allDay: false }
  if (params.TZID) {
    const z = zonedToDate(Y, M, D, H, MI, S, params.TZID)
    if (z) return { date: z, allDay: false }
  }
  return { date: new Date(Y, M - 1, D, H, MI, S), allDay: false }
}

function parseDuration(v: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim())
  if (!m) return 0
  const ms =
    (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * DAY + +(m[4] ?? 0) * 3600000 + +(m[5] ?? 0) * 60000 + +(m[6] ?? 0) * 1000
  return m[1] === '-' ? -ms : ms
}

const unescapeText = (v: string) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1')

function parseRule(v: string): Rule | 'unsupported' {
  const parts: Record<string, string> = {}
  for (const p of v.split(';')) {
    const i = p.indexOf('=')
    if (i > 0) parts[p.slice(0, i).toUpperCase()] = p.slice(i + 1)
  }
  if (parts.FREQ !== 'DAILY' && parts.FREQ !== 'WEEKLY') return 'unsupported'
  const interval = Math.max(1, parseInt(parts.INTERVAL ?? '1', 10) || 1)
  const byday = (parts.BYDAY ?? '')
    .split(',')
    .map((s) => DOW.indexOf(s.slice(-2).toUpperCase()))
    .filter((i) => i >= 0)
  let until: Date | undefined
  if (parts.UNTIL) {
    const u = parseDate(parts.UNTIL, {})
    if (u) until = u.date
  }
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) || undefined : undefined
  return { freq: parts.FREQ, interval, byday, until, count }
}

type Props = Record<string, { params: Record<string, string>; value: string }[]>

function buildEvent(p: Props): { ev: CalendarEvent; unsupported: boolean } | null {
  const first = (k: string) => p[k]?.[0]
  if ((first('STATUS')?.value || '').toUpperCase() === 'CANCELLED') return null
  const dtStart = first('DTSTART')
  if (!dtStart) return null
  const start = parseDate(dtStart.value, dtStart.params)
  if (!start) return null
  const dtEnd = first('DTEND')
  const endParsed = dtEnd ? parseDate(dtEnd.value, dtEnd.params) : null
  const dur = first('DURATION')
  const end = endParsed
    ? endParsed.date
    : new Date(start.date.getTime() + (dur ? parseDuration(dur.value) : start.allDay ? DAY : 0))

  let rule: Rule | undefined
  let unsupported = false
  const rr = first('RRULE')
  if (rr) {
    const parsed = parseRule(rr.value)
    if (parsed === 'unsupported') unsupported = true
    else rule = parsed
  }

  const exdates = new Set<string>()
  for (const ex of p['EXDATE'] ?? []) {
    for (const v of ex.value.split(',')) {
      const d = parseDate(v, ex.params)
      if (d) exdates.add(dayKey(d.date))
    }
  }

  const rid = first('RECURRENCE-ID')
  const ridDate = rid ? parseDate(rid.value, rid.params) : null

  return {
    ev: {
      uid: first('UID')?.value ?? '',
      title: unescapeText(first('SUMMARY')?.value ?? '').trim() || '(No title)',
      start: start.date,
      end,
      allDay: start.allDay,
      rule,
      exdates,
      recurrenceId: ridDate ? dayKey(ridDate.date) : undefined,
    },
    unsupported,
  }
}

export function parseIcs(text: string): ParsedCalendar {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const events: CalendarEvent[] = []
  let unsupported = 0
  let cur: Props | null = null
  let inAlarm = false

  for (const line of lines) {
    const up = line.trim().toUpperCase()
    if (up === 'BEGIN:VEVENT') {
      cur = {}
      inAlarm = false
      continue
    }
    if (up === 'END:VEVENT') {
      if (cur) {
        const built = buildEvent(cur)
        if (built) {
          events.push(built.ev)
          if (built.unsupported) unsupported++
        }
      }
      cur = null
      continue
    }
    if (!cur) continue
    if (up === 'BEGIN:VALARM') {
      inAlarm = true
      continue
    }
    if (up === 'END:VALARM') {
      inAlarm = false
      continue
    }
    if (inAlarm) continue
    const colon = line.indexOf(':')
    if (colon < 1) continue
    const [name, ...paramParts] = line.slice(0, colon).split(';')
    const params: Record<string, string> = {}
    for (const part of paramParts) {
      const eq = part.indexOf('=')
      if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '')
    }
    const key = name.toUpperCase()
    if (!cur[key]) cur[key] = []
    cur[key].push({ params, value: line.slice(colon + 1) })
  }

  // A changed instance of a repeating event replaces that one date of the series.
  const masters = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    if (ev.rule && ev.uid) masters.set(ev.uid, [...(masters.get(ev.uid) ?? []), ev])
  }
  for (const ev of events) {
    if (ev.recurrenceId && ev.uid) for (const m of masters.get(ev.uid) ?? []) m.exdates.add(ev.recurrenceId)
  }

  return { events, unsupported }
}

function occurrenceOn(ev: CalendarEvent, dayStart: Date): DayEvent | null {
  const rule = ev.rule!
  const startDay = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate())
  const diff = Math.round((dayStart.getTime() - startDay.getTime()) / DAY)
  if (diff < 0) return null
  if (ev.exdates.has(dayKey(dayStart))) return null

  const hit = (offset: number) => {
    const d = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + offset)
    if (rule.freq === 'DAILY') {
      if (rule.byday.length && !rule.byday.includes(d.getDay())) return false
      return offset % rule.interval === 0
    }
    const days = rule.byday.length ? rule.byday : [ev.start.getDay()]
    if (!days.includes(d.getDay())) return false
    const weekIdx = Math.floor((offset + ((ev.start.getDay() + 6) % 7)) / 7)
    return weekIdx % rule.interval === 0
  }

  if (!hit(diff)) return null

  const startAt = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate(),
    ev.start.getHours(),
    ev.start.getMinutes(),
    ev.start.getSeconds(),
  )
  if (rule.until && startAt.getTime() > rule.until.getTime()) return null
  if (rule.count) {
    let n = 0
    for (let o = 0; o <= diff; o++) if (hit(o)) n++
    if (n > rule.count) return null
  }
  return {
    title: ev.title,
    start: startAt,
    end: new Date(startAt.getTime() + (ev.end.getTime() - ev.start.getTime())),
    allDay: ev.allDay,
  }
}

export function eventsOnDay(events: CalendarEvent[], day: Date): DayEvent[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  const out: DayEvent[] = []
  for (const ev of events) {
    if (ev.rule) {
      const occ = occurrenceOn(ev, dayStart)
      if (occ) out.push(occ)
      continue
    }
    const zeroLength = ev.end.getTime() === ev.start.getTime()
    const overlaps = ev.start < dayEnd && (ev.end > dayStart || (zeroLength && ev.start >= dayStart))
    if (overlaps) out.push({ title: ev.title, start: ev.start, end: ev.end, allDay: ev.allDay })
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

const GYM =
  /\b(gym|workout|work out|lift|lifting|weights?|run|running|jog|cardio|crossfit|pilates|yoga|spin|swim|swimming|climb|climbing|hiit|training|boxing|hike|soccer|basketball|volleyball|tennis|lacrosse|rowing|intramurals?)\b/
const OUT =
  /\b(party|parties|drinks|bar|club|clubbing|dinner|date night|birthday|formal|social|mixer|game night|concert|movie|brunch|hangout|pregame|tailgate|karaoke|night out|happy hour)\b/
const CRUNCH =
  /\b(exam|midterm|final|finals|quiz|test|due|deadline|study|studying|presentation|interview|thesis|paper|pset|problem set|hackathon)\b/

export function tagEvent(title: string): Exclude<Ctx, 'short'>[] {
  const t = title.toLowerCase()
  const tags: Exclude<Ctx, 'short'>[] = []
  if (GYM.test(t)) tags.push('gym')
  if (OUT.test(t)) tags.push('out')
  if (CRUNCH.test(t)) tags.push('crunch')
  return tags
}

export function detectContext(events: DayEvent[], now: Date, isToday: boolean) {
  const relevant = isToday ? events.filter((e) => e.allDay || e.end.getTime() > now.getTime()) : events
  const tagged = relevant.map((event) => ({ event, tags: tagEvent(event.title) }))
  const detected: Record<Ctx, boolean> = { gym: false, out: false, crunch: false, short: false }
  for (const t of tagged) for (const tag of t.tags) detected[tag] = true
  if (isToday) {
    detected.short = relevant.some((e) => {
      const diff = e.start.getTime() - now.getTime()
      return !e.allDay && diff >= 0 && diff <= 75 * 60000
    })
  }
  return { detected, tagged }
}
