import { NextRequest, NextResponse } from "next/server";
import {
  getTopTierRanking,
  getWeeklyTopDamage,
  getWeeklyTopKills,
  type GameModeFilter,
  type MatchTypeFilter,
  type PerspectiveFilter,
} from "@/actions/rankings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TABS = new Set(["damage", "kills", "tier"]);
const VALID_MODES = new Set(["all", "squad", "duo", "solo"]);
const VALID_PERSPECTIVES = new Set(["all", "fpp", "tpp"]);
const VALID_MATCH_TYPES = new Set(["all", "competitive", "official"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tab = valueOrDefault(searchParams.get("tab"), VALID_TABS, "damage");
  const mode = valueOrDefault(searchParams.get("mode"), VALID_MODES, "all");
  const perspective = valueOrDefault(
    searchParams.get("perspective"),
    VALID_PERSPECTIVES,
    "all"
  );
  const matchType = valueOrDefault(
    searchParams.get("matchType"),
    VALID_MATCH_TYPES,
    "all"
  );

  try {
    const entries =
      tab === "kills"
        ? await getWeeklyTopKills(
            mode as GameModeFilter,
            perspective as PerspectiveFilter,
            matchType as MatchTypeFilter
          )
        : tab === "tier"
          ? await getTopTierRanking(
              mode as GameModeFilter,
              perspective as PerspectiveFilter,
              matchType as MatchTypeFilter
            )
          : await getWeeklyTopDamage(
              mode as GameModeFilter,
              perspective as PerspectiveFilter,
              matchType as MatchTypeFilter
            );

    return NextResponse.json(
      {
        entries: entries.map((entry) => ({
          rank: entry.rank,
          nickname: entry.nickname,
          playerId: entry.player_id,
          platform: "steam",
          value: entry.value,
          secondary: entry.secondary,
          label: entry.tier ?? "",
          gameMode: entry.game_mode,
          mapName: entry.map_name,
          tier: entry.tier,
          createdAt: entry.created_at,
          matchCount: entry.match_count,
        })),
        query: { tab, mode, perspective, matchType },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function valueOrDefault(
  value: string | null,
  allowed: Set<string>,
  fallback: string
) {
  if (!value) return fallback;
  return allowed.has(value) ? value : fallback;
}
