import type { Action, Block } from "../../../system/spec";

export type BlockOf<T extends Block["type"]> = Extract<Block, { type: T }>;
export interface BlockProps<T extends Block["type"]> {
  block: BlockOf<T>;
  /** Emit an action without closing the window (used by in-block controls like goal logging). */
  onAction?: (action: Action) => void;
}
export const toneClass = (tone?: string) => (tone ? `tone-${tone}` : "");
export const barToneClass = (tone?: string) => `bar-${tone ?? "cyan"}`;
