// STUB — replaced by the engine implementation.
import type { Config, Event, ReduceResult, State } from "./types";
export function createInitialState(_config: Config): State { throw new Error("engine not implemented"); }
export function reduce(_state: State, _event: Event): ReduceResult { throw new Error("engine not implemented"); }
export function replay(_config: Config, _events: Event[]): State { throw new Error("engine not implemented"); }
