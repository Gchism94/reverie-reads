export interface QuizOption {
  t: string
  subs?: Record<string, number>
  mood?: string
  dark?: number
  arts?: Record<string, number>
  spice?: number
  tropes?: string[]
  pace?: 'slow' | 'mid' | 'fast'
}

export interface QuizQuestion {
  q: string
  opts: QuizOption[]
}

export const QUIZ: QuizQuestion[] = [
  {
    q: 'What kind of story are you craving right now?',
    opts: [
      { t: 'Sweeping fantasy & magic', subs: { Romantasy: 3, Fantasy: 1 }, mood: 'epic', arts: { fae: 1, dragon: 1 } },
      { t: 'Dark & intense', subs: { 'Dark Romance': 3 }, mood: 'intense', dark: 1, arts: { villain: 1, mafia: 1 } },
      { t: 'Cozy & heartfelt', subs: { Romance: 2, Contemporary: 2 }, mood: 'cozy', arts: { cinnamon: 1 } },
      { t: 'Fun, flirty & fast', subs: { Romance: 2, Contemporary: 1 }, mood: 'playful', arts: { rogue: 1 } },
    ],
  },
  {
    q: 'How much heat are you in the mood for?',
    opts: [
      { t: 'Sweet — closed door', spice: 1 },
      { t: 'A little warmth', spice: 2 },
      { t: 'Steamy', spice: 3 },
      { t: 'Scorching', spice: 4 },
      { t: 'Off the charts', spice: 5, arts: { villain: 1 } },
    ],
  },
  {
    q: 'Pick your burn.',
    opts: [
      { t: 'Slow burn — make me wait', tropes: ['Slow Burn'], pace: 'slow' },
      { t: 'A steady simmer', pace: 'mid' },
      { t: 'Fast & all-consuming', pace: 'fast' },
    ],
  },
  {
    q: 'Which dynamic sounds perfect tonight?',
    opts: [
      { t: 'Enemies to lovers', tropes: ['Enemies to Lovers'], arts: { rogue: 1, gray: 1 } },
      { t: 'Grumpy × sunshine', tropes: ['Grumpy/Sunshine'], arts: { protector: 1, cinnamon: 1 } },
      { t: 'Forbidden / forced proximity', tropes: ['Forbidden Love', 'Forced Proximity'], arts: { gray: 1, tortured: 1 } },
      { t: 'Fated mates / soulmates', tropes: ['Fated Mates'], arts: { fae: 1, dragon: 1 } },
      { t: 'Second chance', tropes: ['Second Chance'], arts: { tortured: 1 } },
    ],
  },
  {
    q: 'How do you want to feel when you close it?',
    opts: [
      { t: 'Swoony & warm', mood: 'swoony', arts: { cinnamon: 1 } },
      { t: 'Wrecked, in the best way', mood: 'angsty', tropes: ['Slow Burn'], arts: { tortured: 1 } },
      { t: 'Empowered & thrilled', mood: 'epic', subs: { Romantasy: 1 } },
      { t: 'Comforted & cozy', mood: 'cozy' },
    ],
  },
]

export const HEAT = ['', 'Sweet', 'Warm', 'Steamy', 'Scorching', 'Blistering']

export const WORLD: Record<string, string> = {
  Romantasy: 'fantasy romance',
  'Dark Romance': 'dark romance',
  Romance: 'romance',
  Contemporary: 'contemporary romance',
  Sports: 'sports romance',
  'Cowboy Romance': 'cowboy romance',
  Fantasy: 'fantasy romance',
}

export interface QuizAnswers {
  arts: Record<string, number>
  subs: Record<string, number>
  spices: number[]
  tropes: string[]
  dark: number
  pace: 'slow' | 'mid' | 'fast' | null
}

export const emptyAnswers = (): QuizAnswers => ({
  arts: {},
  subs: {},
  spices: [],
  tropes: [],
  dark: 0,
  pace: null,
})

export function applyAnswer(a: QuizAnswers, o: QuizOption): QuizAnswers {
  const next: QuizAnswers = {
    arts: { ...a.arts },
    subs: { ...a.subs },
    spices: [...a.spices],
    tropes: [...a.tropes],
    dark: a.dark + (o.dark ?? 0),
    pace: o.pace ?? a.pace,
  }
  for (const [k, v] of Object.entries(o.arts ?? {})) next.arts[k] = (next.arts[k] ?? 0) + v
  for (const [k, v] of Object.entries(o.subs ?? {})) next.subs[k] = (next.subs[k] ?? 0) + v
  if (o.tropes) next.tropes.push(...o.tropes)
  if (o.spice) next.spices.push(o.spice)
  return next
}
