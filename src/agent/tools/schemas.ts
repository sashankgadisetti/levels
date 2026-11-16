/**
 * Input schemas for every tool, written once in zod (v4). They feed:
 *   - ToolDef.inputSchema (draft-07 JSON Schema, additionalProperties:false) for MCP / GET /v1/tools
 *   - betaZodTool in the in-app runner (src/agent/runner.ts)
 *   - argument validation in toolHost.execute for every source
 */
import { z } from "zod";
import { SCREENS } from "../../store/ui";
import type { ToolName } from "../contract";

const goalRef = {
  goal_id: z.string().max(80).optional().describe("Exact goal id from get_today (e.g. \"2026-11-16:study\"). Preferred when known."),
  habit_id: z.string().max(40).optional().describe("Habit id from get_config (e.g. \"study\", \"gym\")."),
  label: z.string().max(60).optional().describe("Fuzzy goal name if no id is known, e.g. \"workout\", \"reading\", \"meals\"."),
};

export const SCHEMAS = {
  get_status: z.strictObject({}),
  get_today: z.strictObject({}),
  get_history: z.strictObject({
    days: z.number().int().min(1).max(90).optional().describe("How many closed days to return, most recent last. Default 14, max 90."),
  }),
  get_config: z.strictObject({}),
  log_progress: z.strictObject({
    ...goalRef,
    delta: z.number().min(-1440).max(1440).optional().describe("Amount to ADD in the goal's own unit (minutes for study, meals for eat, sessions for gym). Negative to correct a mistake."),
    value: z.number().min(0).max(1440).optional().describe("Absolute value to SET in the goal's unit, e.g. 7 for \"slept 7 hours\". Use instead of delta."),
  }),
  log_text: z.strictObject({
    text: z.string().min(1).max(500).describe("What the player did, in their own words, e.g. \"gym done, 40 min study, 2 meals, slept 7\"."),
    apply: z.boolean().optional().describe("true = log the parsed entries now (and show a confirmation window with UNDO). false (default) = only return the parsed proposal."),
  }),
  complete_goal: z.strictObject({ ...goalRef }),
  answer_checkin: z.strictObject({
    habit_id: z.string().max(40).describe("Habit id of a yes/no check-in habit, e.g. \"water\"."),
    yes: z.boolean().describe("true = the player did it since the last check-in (+1); false = not yet."),
  }),
  take_rest_day: z.strictObject({ ...goalRef }),
  start_dungeon: z.strictObject({
    minutes: z.number().int().min(1).max(180).optional().describe("Focus session length in minutes. Clamped to the dungeon rank's bounds: E 25, D 25–50, C 50, B 50–90, A/S 90. Default: the shortest the rank allows."),
    boss: z.string().max(60).optional().describe("The boss: what the player will work on, e.g. \"Chapter 3 problem set\". Default: today's unfinished project strike or first unfinished goal."),
    goal_id: z.string().max(80).optional().describe("Goal id from get_today of a minutes goal (e.g. study) that the session's minutes count toward when the boss is defeated. Default: the unfinished Study goal, if any."),
    use_key: z.boolean().optional().describe("Spend the highest-rank Dungeon Key in the inventory (rank sets duration and rewards). Default true when a key is held. false or no key = keyless E-rank dungeon, 25 min, half rewards."),
  }),
  abandon_dungeon: z.strictObject({}),
  undo_last_log: z.strictObject({}),
  log_past_day: z.strictObject({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("The past day to amend (YYYY-MM-DD). Default: yesterday. Only days that already ended, within the last 7 days."),
    days_ago: z.number().int().min(1).max(7).optional().describe("Alternative to date: 1 = yesterday, 2 = the day before."),
    habit_ids: z.array(z.string()).max(12).optional().describe("Habit ids to mark complete for that day (see get_config / get_today). Default: every goal that was not completed."),
  }),
  list_rewards: z.strictObject({}),
  add_reward: z.strictObject({
    name: z.string().min(1).max(60).describe("Real-world reward, e.g. \"New headphones\"."),
    usd: z.number().min(0).max(10000).describe("Real price in US dollars. Gold price is derived from it."),
    url: z.string().max(300).optional().describe("Optional product link."),
    stat: z.enum(["STR", "VIT", "AGI", "INT", "SENSE", "HYD"]).optional().describe("Optional stat the reward is themed on."),
    note: z.string().max(120).optional(),
  }),
  buy_reward: z.strictObject({
    reward_id: z.string().max(64).optional().describe("Reward id from list_rewards."),
    name: z.string().max(60).optional().describe("Fuzzy reward name if no id is known."),
  }),
  ask_system: z.strictObject({
    question: z.string().min(1).max(300).describe("A question for the System (Oracle), e.g. \"why is my VIT lagging?\"."),
  }),
  propose_targets: z.strictObject({
    changes: z.array(z.strictObject({
      habit_id: z.string().max(40).describe("Habit id from get_config."),
      target: z.number().min(0).max(1440).describe("New daily target in the habit's unit."),
    })).max(8).describe("Target changes. From the in-app agent each change is clamped to within ±25% of the current target."),
    reason: z.string().min(1).max(400).describe("One or two sentences explaining the changes, shown to the player."),
    verdict: z.string().max(600).optional().describe("Optional 3–5 line verdict on the past week, in the System's voice (one line per sentence)."),
    next_gate: z.string().max(300).optional().describe("Optional proposed Gate (weekly challenge) for next week, as plain text."),
  }),
  open_screen: z.strictObject({
    screen: z.enum(SCREENS).describe("Screen to bring forward."),
  }),
} satisfies Record<ToolName, z.ZodType>;

export type ToolArgs<N extends ToolName> = z.infer<(typeof SCHEMAS)[N]>;
