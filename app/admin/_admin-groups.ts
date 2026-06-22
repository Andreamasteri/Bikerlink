import type { AdminGroup } from "./_admin-types";
import { adminGroupsPart1 } from "./_admin-groups-part1";
import { adminGroupsPart2 } from "./_admin-groups-part2";

export const OPEN_BY_DEFAULT = new Set<string>();

export const adminGroups: AdminGroup[] = [...adminGroupsPart1, ...adminGroupsPart2];
