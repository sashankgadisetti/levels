import type { Ctx } from "./ctx";
import { checkSkills } from "./skills";
import { checkTitles } from "./titles";

/** Run after every event: unlock titles and skills (auto-equips the first title). */
export function checkUnlocks(c: Ctx): void {
  checkTitles(c);
  checkSkills(c);
}
