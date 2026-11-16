/**
 * Pending approvals. A System window that needs the player's yes/no carries
 * `accept` / `decline` actions whose `arg` is `proposal:<id>`; src/store/actions.ts
 * routes those here. Proposals live in memory only (a reload drops them, which is
 * the same as DECLINE). Dependency-free on purpose: actions.ts imports it.
 */
export const PROPOSAL_PREFIX = "proposal:";

export interface Proposal {
  id: string;
  kind: string;
  createdAt: number;
  onAccept?: () => void | Promise<void>;
  onDecline?: () => void | Promise<void>;
  /** Free-form payload for tests / UI (e.g. the target changes). */
  data?: unknown;
}

const pending = new Map<string, Proposal>();
const MAX_PENDING = 50;
let seq = 0;

export function createProposal(p: Omit<Proposal, "id" | "createdAt">): Proposal {
  const id = `${Date.now().toString(36)}${(seq++).toString(36)}`;
  const proposal: Proposal = { ...p, id, createdAt: Date.now() };
  pending.set(id, proposal);
  if (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value as string);
  return proposal;
}

/** The action arg for a proposal button. */
export const proposalArg = (id: string) => `${PROPOSAL_PREFIX}${id}`;
export const isProposalArg = (arg: string | undefined): arg is string => !!arg && arg.startsWith(PROPOSAL_PREFIX);

export const getProposal = (id: string) => pending.get(id.startsWith(PROPOSAL_PREFIX) ? id.slice(PROPOSAL_PREFIX.length) : id);
export const pendingProposals = () => [...pending.values()];

/** Resolve once; later presses of the same window's buttons are ignored. Returns false if unknown/already resolved. */
export async function resolveProposal(idOrArg: string, accepted: boolean): Promise<boolean> {
  const id = idOrArg.startsWith(PROPOSAL_PREFIX) ? idOrArg.slice(PROPOSAL_PREFIX.length) : idOrArg;
  const p = pending.get(id);
  if (!p) return false;
  pending.delete(id);
  try {
    await (accepted ? p.onAccept?.() : p.onDecline?.());
  } catch (err) {
    console.error("[agent] proposal handler failed", p.kind, err);
  }
  return true;
}

export function clearProposals(): void { pending.clear(); }
