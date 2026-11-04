import type { ComponentType } from "react";
import type { Block } from "../../../system/spec";
import { Bar } from "./Bar";
import { Divider } from "./Divider";
import { GoalRow } from "./GoalRow";
import { ItemCard } from "./ItemCard";
import { Kv } from "./Kv";
import { List } from "./List";
import { RankBadge } from "./RankBadge";
import { Shadow } from "./Shadow";
import { StatRow } from "./StatRow";
import { Text } from "./Text";
import { Timer } from "./Timer";
import type { BlockProps } from "./types";

/** type -> component. Closed set: unknown types render nothing. */
export const BLOCKS: { [K in Block["type"]]: ComponentType<BlockProps<K>> } = {
  text: Text, goalRow: GoalRow, statRow: StatRow, bar: Bar, kv: Kv, timer: Timer,
  list: List, divider: Divider, itemCard: ItemCard, shadow: Shadow, rankBadge: RankBadge,
};
export { Bar, Divider, GoalRow, ItemCard, Kv, List, RankBadge, Shadow, StatRow, Text, Timer };
