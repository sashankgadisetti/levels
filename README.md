# Levels — "Arise."

A Solo Leveling–style life RPG for your desktop. Daily habits are the **Daily
Quest**; finishing them levels you up in four stats:

| Stat | Habit |
|---|---|
| **STRENGTH** | Gym / working out |
| **INTELLIGENCE** | Learning for your career |
| **SENSE** | Sleeping every night |
| **VITALITY** (HP) | Eating healthy |

The System pops floating blue windows on your screen exactly like the anime:
daily quests in the morning, warnings before the deadline, level-ups, titles,
the Penalty Zone if you skip, and "Arise" when a streak becomes a Shadow.
Gold you earn buys real-world gear that makes you better, priced against a
monthly budget. An optional **Oracle** lets Claude generate the System's
windows at runtime (generative UI) within a strict, validated schema.

## Docs

| | |
|---|---|
| [docs/01-research.md](docs/01-research.md) | How the System works in the manhwa/anime and how each piece maps to the app |
| [docs/02-features.md](docs/02-features.md) | Full feature catalog with priorities and acceptance criteria |
| [docs/03-ui-spec.md](docs/03-ui-spec.md) | Design tokens, window anatomy, exact pop-up copy |
| [docs/04-architecture.md](docs/04-architecture.md) | Stack, engine, numbers, the Oracle (generative UI) |
| [docs/05-roadmap.md](docs/05-roadmap.md) | Phased plan and open questions |
| [docs/prototype/index.html](docs/prototype/index.html) | Click-through visual prototype of every System window |

## Stack

Tauri 2 · React 19 · TypeScript · Vite · Tailwind v4 · Zustand · framer-motion ·
SQLite · Zod · vitest · `@anthropic-ai/sdk` for the Oracle.

## Run

See [SETUP.md](SETUP.md) for prerequisites, then:

```bash
npm install
npm run tauri dev
```

Browser-only preview (no pop-up windows, no persistence): `npm run dev`.

## Configure your quests

Edit `src/engine/config.ts` (or Settings in the app): stat names, the habits
behind each stat, daily targets, rest days, the day boundary, your monthly
reward budget, and the Oracle model/budget.
