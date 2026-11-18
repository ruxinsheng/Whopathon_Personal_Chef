import type { Ctx } from './calendar'
import type { Recipe } from './recipes'

export const BUDGET_MIN = 0.6
export const BUDGET_MAX = 2.5

const norm = (w: string) => w.replace(/(es|s)$/, '')
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map(norm)

export const itemMatches = (core: string, item: string) => {
  const c = words(core)
  const i = words(item)
  return i.length > 0 && (i.every((w) => c.includes(w)) || c.every((w) => i.includes(w)))
}

export type Pick = { recipe: Recipe; score: number; reasons: string[]; missing: string[] }

export function pickMeals(
  recipes: Recipe[],
  ctx: Record<Ctx, boolean>,
  owned: string[],
  limit = 3,
): Pick[] {
  const picks = recipes.map((recipe) => {
    let score = 0
    const why: { text: string; weight: number }[] = []
    const add = (weight: number, text?: string) => {
      score += weight
      if (text && weight > 0) why.push({ text, weight })
    }

    if (ctx.gym) {
      if (recipe.protein === 'high') add(4, 'Higher protein for your workout.')
      else if (recipe.protein === 'medium') add(1)
      else add(-1)
    }
    if (ctx.out) {
      if (recipe.size === 'light') add(4, 'Light, so you are not stuffed before going out.')
      else if (recipe.size === 'regular') add(1)
      else add(-3)
    }

    if (recipe.ahead) {
      // Needs to be made the night before, so it cannot help when you are rushed.
      if (ctx.crunch || ctx.short) add(-4)
    } else {
      let quick = 0
      if (ctx.crunch) quick += recipe.mins <= 5 ? 3 : recipe.mins <= 10 ? 2 : 0
      if (ctx.short) quick += recipe.mins <= 5 ? 4 : recipe.mins <= 10 ? 2 : -3
      add(quick, `Ready in about ${recipe.mins} minutes.`)
    }

    const have = recipe.core.filter((c) => owned.some((o) => itemMatches(c, o)))
    const missing = recipe.core.filter((c) => !have.includes(c))
    if (owned.length > 0) {
      if (have.length === 0) add(-2)
      else if (missing.length === 0) add(4, 'You have everything for it.')
      else add((4 * have.length) / recipe.core.length, `You have ${have.length} of ${recipe.core.length} ingredients.`)
    }

    add((BUDGET_MAX - recipe.cost) * 0.5)

    const reasons = why
      .sort((a, b) => b.weight - a.weight)
      .map((w) => w.text)
      .filter((t, i, arr) => arr.indexOf(t) === i)
      .slice(0, 3)
    return { recipe, score, reasons, missing: owned.length > 0 ? missing : [] }
  })

  return picks.sort((a, b) => b.score - a.score || a.recipe.cost - b.recipe.cost).slice(0, limit)
}
