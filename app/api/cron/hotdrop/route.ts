/**
 * app/api/cron/hotdrop/route.ts
 *
 * Vercel Cron Job: 매일 실행 (vercel.json schedule: "0 18 * * *")
 * - PUBG /leaderboards → 상위 랭커 accountId 수집
 * - 각 플레이어의 최근 매치 텔레메트리 다운로드
 * - LogParachuteLanding 이벤트에서 착지 좌표 추출
 * - 맵별 128×128 그리드 셀 count UPSERT → hotdrop_heatmap 테이블
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const PUBG_BASE = "https://api.pubg.com/shards/steam";

/** 맵 코드 → 슬러그 매핑 (라이브 맵만 포함) */
const MAP_SLUG: Record<string, string> = {
  Baltic_Main:    "erangel",
  Erangel_Main:   "erangel",
  Desert_Main:    "miramar",
  Tiger_Main:     "taego",
  Neon_Main:      "rondo",
  Savage_Main:    "sanhok",
  Summer_Main:    "sanhok",
  DihorOtok_Main: "vikendi",
  Kiki_Main:      "deston",
};

/** 맵 크기 (cm 단위, Leaflet 8192px 기준) */
const MAP_SIZES: Record<string, number> = {
  erangel: 819200, 
  miramar: 819200, 
  taego: 819200, 
  deston: 819200, 
  rondo: 819200, 
  vikendi: 819200,
  sanhok: 409600, 
  paramo: 307200, 
  karakin: 204800, 
  haven: 102400
};

const GRID_DIVISIONS = 256;   // 256×256 = 65,536 셀
const RATE_LIMIT_MS  = 6500; // PUBG API 분당 10회 제한 → 약 6.5초 간격
const MAX_RANKERS    = 10;    // 1회 Cron당 처리할 랭커 수 (시간 제한 고려)
const MATCHES_PER_PLAYER = 3; // 플레이어당 최근 N경기

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scaleX(x: number, mapSize: number) {
  return (x / mapSize) * 8192;
}

function scaleY(y: number, mapSize: number) {
  return 8192 - (y / mapSize) * 8192;
}

function getGridKey(px: number, py: number): { gx: number; gy: number } {
  const cellSize = 8192 / GRID_DIVISIONS;
  return {
    gx: Math.min(Math.floor(px / cellSize), GRID_DIVISIONS - 1),
    gy: Math.min(Math.floor(py / cellSize), GRID_DIVISIONS - 1),
  };
}

function getCellCenter(gx: number, gy: number): { cx: number; cy: number } {
  const cellSize = 8192 / GRID_DIVISIONS;
  return {
    cx: (gx + 0.5) * cellSize,
    cy: (gy + 0.5) * cellSize,
  };
}

// ─────────────────────────────────────────────
// PUBG API 래퍼
// ─────────────────────────────────────────────

async function pubgFetch(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`PUBG API error ${res.status}: ${url.slice(-60)}`);
  }
  return res.json();
}

/** 현재 활성 시즌 ID 조회 */
async function getCurrentSeason(apiKey: string): Promise<string> {
  const data = await pubgFetch(`${PUBG_BASE}/seasons`, apiKey);
  const current = data.data?.find(
    (s: any) => s.attributes?.isCurrentSeason === true
  );
  return current?.id ?? "unknown-season";
}

/** 리더보드에서 상위 랭커 accountId 목록 반환 */
async function getTopRankers(
  apiKey: string,
  seasonId: string,
  limit: number
): Promise<string[]> {
  try {
    // 솔로/듀오/스쿼드 리더보드 중 스쿼드 FPP 기준
    const data = await pubgFetch(
      `${PUBG_BASE}/leaderboards/${seasonId}/squad-fpp?page[number]=1&page[size]=20`,
      apiKey
    );
    const rows = data.data?.relationships?.players?.data ?? [];
    return rows.slice(0, limit).map((r: any) => r.id as string);
  } catch (e: any) {
    // 리더보드 API가 없거나 시즌이 맞지 않으면 빈 배열
    console.warn("[hotdrop] Leaderboard fetch failed:", e.message);
    return [];
  }
}

/** 최신 매치 샘플 목록 반환 (Fallback 용) */
async function getSampleMatchIds(apiKey: string, limit: number): Promise<string[]> {
  try {
    const data = await pubgFetch(`${PUBG_BASE}/samples`, apiKey);
    const matches = data.data?.relationships?.matches?.data ?? [];
    return matches.slice(0, limit).map((m: any) => m.id as string);
  } catch (e: any) {
    console.error("[hotdrop] Sample fetch failed:", e.message);
    return [];
  }
}

/** accountId → 최근 매치 ID 목록 */
async function getRecentMatchIds(
  apiKey: string,
  accountId: string,
  limit: number
): Promise<string[]> {
  const data = await pubgFetch(
    `${PUBG_BASE}/players/${accountId}`,
    apiKey
  );
  const player = data.data;
  if (!player) return [];
  const matches = player.relationships?.matches?.data ?? [];
  return matches.slice(0, limit).map((m: any) => m.id as string);
}

/** 텔레메트리 URL과 mapName 반환 */
async function getMatchMeta(
  apiKey: string,
  matchId: string
): Promise<{ telemetryUrl: string; mapSlug: string } | null> {
  const data = await pubgFetch(`${PUBG_BASE}/matches/${matchId}`, apiKey);
  const mapName: string = data.data?.attributes?.mapName ?? "";
  const mapSlug = MAP_SLUG[mapName];

  // 이벤트 모드 또는 미지원 맵 제외
  if (!mapSlug) return null;

  const assets = (data.included ?? []).filter((i: any) => i.type === "asset");
  const telUrl = assets[0]?.attributes?.URL;
  if (!telUrl) return null;

  return { telemetryUrl: telUrl, mapSlug };
}

/** 텔레메트리에서 LogParachuteLanding 좌표 추출 */
async function extractLandings(
  telemetryUrl: string,
  mapSlug: string
): Promise<Array<{ px: number; py: number }>> {
  const res = await fetch(telemetryUrl, {
    headers: { "Accept-Encoding": "gzip, deflate" },
  });
  if (!res.ok) return [];

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let jsonStr: string;
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    const zlib = await import("node:zlib");
    jsonStr = zlib.gunzipSync(buffer).toString("utf-8");
  } else {
    jsonStr = buffer.toString("utf-8");
  }

  const events: any[] = JSON.parse(jsonStr);
  const mapSize = MAP_SIZES[mapSlug] ?? 816000;
  const results: Array<{ px: number; py: number }> = [];

  for (const ev of events) {
    const type: string = ev._T ?? ev.Type ?? "";
    if (type !== "LogParachuteLanding") continue;

    const loc = ev.character?.location;
    if (!loc) continue;

    results.push({
      px: scaleX(loc.x ?? 0, mapSize),
      py: scaleY(loc.y ?? 0, mapSize),
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// UPSERT → Supabase
// ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertHeatmap(
  supabase: any,
  mapSlug: string,
  seasonId: string,
  landings: Array<{ px: number; py: number }>
) {
  // 셀별 count 집계
  const cellMap = new Map<string, { gx: number; gy: number; cx: number; cy: number; count: number }>();

  for (const { px, py } of landings) {
    const { gx, gy } = getGridKey(px, py);
    const key = `${gx}:${gy}`;
    const { cx, cy } = getCellCenter(gx, gy);

    if (cellMap.has(key)) {
      cellMap.get(key)!.count++;
    } else {
      cellMap.set(key, { gx, gy, cx, cy, count: 1 });
    }
  }

  if (cellMap.size === 0) return;

  const rows = Array.from(cellMap.values()).map(({ gx, gy, cx, cy, count }) => ({
    map_name:   mapSlug,
    season:     seasonId,
    grid_x:     gx,
    grid_y:     gy,
    px:         cx,
    py:         cy,
    count,
    updated_at: new Date().toISOString(),
  }));

  // batch UPSERT (Supabase는 count 누적을 RPC로 처리)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("upsert_hotdrop_counts", { rows: JSON.stringify(rows) });
  if (error) {
    console.error("[hotdrop] upsert RPC error:", error.message);
    // RPC 없을 경우 fallback: 개별 upsert
    for (const row of rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("hotdrop_heatmap")
        .upsert(
          { ...row },
          { onConflict: "map_name,season,grid_x,grid_y" }
        );
    }
  }
}

// ─────────────────────────────────────────────
// 이전 시즌 정리
// ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanupOldSeasons(
  supabase: any,
  currentSeasonId: string
) {
  const { error } = await supabase
    .from("hotdrop_heatmap")
    .delete()
    .neq("season", currentSeasonId);

  if (error) {
    // 운영 모니터링을 위해 에러는 남겨둡니다.
    console.error("[hotdrop] 이전 시즌 정리 실패:", error.message);
  }
}

// ─────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────

export const maxDuration = 300; // Vercel 함수 최대 실행 시간 (Pro: 300s)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  // Vercel Cron 인증 헤더 검증
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const apiKey = (process.env.PUBG_API_KEY ?? "").split(" ")[0].trim();
  if (!apiKey) {
    return NextResponse.json({ error: "PUBG_API_KEY 환경변수 누락" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const log: string[] = [];
  let totalLandings = 0;
  const processedMatchIds = new Set<string>();

  try {
    // 1. 현재 시즌 조회
    await sleep(RATE_LIMIT_MS);
    const seasonId = await getCurrentSeason(apiKey);
    log.push(`시즌: ${seasonId}`);

    // 2. 이전 시즌 데이터 정리
    await cleanupOldSeasons(supabase, seasonId);

    // 3. 수집 대상 매치 선정 (Ranker -> Samples 순으로 시도)
    await sleep(RATE_LIMIT_MS);
    const rankerIds = await getTopRankers(apiKey, seasonId, MAX_RANKERS);
    
    if (rankerIds.length > 0) {
      log.push(`Leaderboard 기반 수집 시작 (${rankerIds.length}명)`);
      for (const accountId of rankerIds) {
        await sleep(RATE_LIMIT_MS);
        try {
          const matchIds = await getRecentMatchIds(apiKey, accountId, MATCHES_PER_PLAYER);
          matchIds.forEach(id => processedMatchIds.add(id));
        } catch (e: any) {
          log.push(`  ⚠ 플레이어 매치 조회 실패 (${accountId.slice(-8)}): ${e.message}`);
        }
      }
    } else {
      log.push(`Leaderboard 데이터 없음. Samples 기반 수집으로 전환.`);
      await sleep(RATE_LIMIT_MS);
      const sampleMatchIds = await getSampleMatchIds(apiKey, 15); // 약 15개 매치 샘플링
      sampleMatchIds.forEach(id => processedMatchIds.add(id));
      log.push(`Samples 매치 획득: ${processedMatchIds.size}개`);
    }

    // 4. 매치별 텔레메트리 처리
    const matchIds = Array.from(processedMatchIds);
    log.push(`매치 분석 시작 (총 ${matchIds.length}개)`);

    for (const matchId of matchIds) {
      await sleep(RATE_LIMIT_MS);
      let meta: Awaited<ReturnType<typeof getMatchMeta>>;
      try {
        meta = await getMatchMeta(apiKey, matchId);
      } catch (e: any) {
        log.push(`  ⚠ 매치 메타 실패 (${matchId.slice(-8)}): ${e.message}`);
        continue;
      }

      if (!meta) {
        log.push(`  - 스킵 (${matchId.slice(-8)}): 미지원 맵 또는 이벤트`);
        continue;
      }

      try {
        const landings = await extractLandings(meta.telemetryUrl, meta.mapSlug);
        if (landings.length > 0) {
          totalLandings += landings.length;
          await upsertHeatmap(supabase, meta.mapSlug, seasonId, landings);
          log.push(`  ✓ ${meta.mapSlug} [${matchId.slice(-8)}] → ${landings.length}명`);
        }
      } catch (e: any) {
        log.push(`  ⚠ 분석 실패 (${matchId.slice(-8)}): ${e.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      season: seasonId,
      source: rankerIds.length > 0 ? "leaderboard" : "samples",
      totalLandings,
      processedMatches: matchIds.length,
      log,
    });
  } catch (err: any) {
    console.error("[hotdrop] Cron 치명적 오류:", err);
    return NextResponse.json({ success: false, error: err.message, log }, { status: 500 });
  }
}
