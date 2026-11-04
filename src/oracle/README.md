# The Oracle

Claude plays the System: it emits a strict `SystemWindowSpec` JSON (src/system/spec.ts) that the fixed React renderer draws. It never emits HTML. Everything is optional: any failure returns `null` and the caller uses the engine's template window.

## Flow
`buildDigest(state, now)` (compact summary, no history) -> `client.messages.create` with `output_config.format` = JSON schema from `oracleJsonSchema()` (zod-generated, with unsupported keywords stripped) -> `JSON.parse` -> `parseSpec` (zod, the real gate) -> per-kind checks -> `{ spec: { ...spec, generated: true }, costUsd }`.

- Models: `config.oracle.model` (default `claude-opus-5-5`) for dayStart / gate / ask; `flavorModel` (`claude-haiku-5-5`) for commentary / shadowName.
- Adaptive thinking, low effort (medium for `ask`), non-streaming, max_tokens 3000 (2000 flavor).
- The system prompt is a constant with `cache_control: ephemeral`; digest and request go in the user message. Note: caching only kicks in above the model's minimum cacheable prefix.
- dayStart is cached per game date, gate per ISO week (`oracle:dayStart:2026-11-04`, `oracle:gate:2026-W45`). Use `LocalStorageOracleCache` in the app.
- Post-checks: dayStart goalRows must match today's goal ids and targets; gate has no goalRow; penalty variant rejected; actions outside `ORACLE_ACTION_KINDS` are stripped; titles lose brackets (renderer adds them); ask is truncated to 8 blocks.

## Usage
```ts
const oracle = createOracle({
  getApiKey: () => settings.anthropicKey,   // entered in Settings, stored via tauri-plugin-store
  config: () => store.getState().config.oracle,
  cache: new LocalStorageOracleCache(),
});
const spec = await handleOracleEffect(effect, state, oracle); // null -> show template
```
Set `config.oracle.enabled = true` and provide a key. No key / disabled / over budget = no network call.

## Cost
Opus 5.5 $4/$20 per MTok, Haiku 5.5 $0.10/$0.50. A dayStart call is ~2.5k in / ~0.6k out, roughly $0.02 on Opus; commentary is well under $0.001. Typical day (1 dayStart + a few commentaries + a couple of asks) is ~$0.05 to $0.15. `dailyBudgetUsd` (default 0.25) stops calls once reached; spend is stored in the cache under `oracle:spend:<date>` and is billed even if the output is later rejected.

## Adding a request kind
1. Add a prompt builder in `prompts.ts` (and the kind to `OracleKind`).
2. Add a method on `Oracle` in `client.ts` using `call(kind, state, prompt, check)`; wrap in `cached(...)` if it is once-per-period.
3. Add a case to `handleOracleEffect` (and the `request` union in `src/engine/types.ts`, owned by the engine).
4. Add tests in `__tests__/`; if you change SYSTEM_PROMPT, update its inline snapshot on purpose.
