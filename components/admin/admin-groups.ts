import type { AdminGroup } from "@/components/admin/admin-types";
import { adminGroupsPart1 } from "@/components/admin/admin-groups-part1";
import { adminGroupsPart2 } from "@/components/admin/admin-groups-part2";

export const OPEN_BY_DEFAULT = new Set<string>();

export const adminGroups: AdminGroup[] = [...adminGroupsPart1, ...adminGroupsPart2];
