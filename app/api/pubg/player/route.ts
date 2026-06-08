import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { trackPubgRateLimit } from "@/lib/pubg-analysis/pubgApiTracker";
import { reportPubgApiError } from "@/lib/pubg/apiHelper";

// ─────────────────────────────────────────────────────────────
// [CACHE] PUBG API 호출 절약을 위한 서버 측 인메모리 캐싱 레이어 (3분 TTL)
// ─────────────────────────────────────────────────────────────
interface CacheEntry {
  timestamp: number;
  data: any;
}
const playerResponseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3분 쿨다운

// [V12.1] 네트워크 불안정 대응을 위한 재시도 헬퍼 함수 (전체 대기 시간 누적 방지)
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isNetworkError = err.message?.includes('fetch') || err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message?.includes('timeout');
      if (!isNetworkError) throw err;
      console.warn(`[RETRY] Attempt ${i + 1} failed. Retrying in ${delay}ms...`, err.message);
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }
  throw lastError;
}

async function safeJsonParse(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    throw new Error(`PUBG API 응답이 JSON 형식이 아닙니다 (Content-Type: ${contentType}, Status: ${res.status}). API 호출 한도 초과 또는 일시적인 장애일 수 있습니다.`);
  }
  try {
    return await res.json();
  } catch (err: any) {
    throw new Error(`JSON 파싱 실패: ${err.message}`);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nickname = searchParams.get("nickname");
  const platform = searchParams.get("platform") || "steam";
  const reqSeason = searchParams.get("season");

  if (!nickname)
    return NextResponse.json(
      { error: "닉네임을 입력해주세요." },
      { status: 400 }
    );

  // 1. 서버 인메모리 캐시 조회 (3분 TTL)
  const cacheKey = `${platform}:${nickname.toLowerCase()}:${reqSeason || 'current'}`;
  const cachedEntry = playerResponseCache.get(cacheKey);
  if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)) {
    console.log(`[IN-MEMORY CACHE HIT] ${cacheKey}`);
    return NextResponse.json(cachedEntry.data);
  }

  // 환경 변수에서 불필요한 공백 및 텍스트(예: "Rate Limit 10 RPM...")를 제거하고 진짜 토큰만 추출
  const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/vnd.api+json",
  };

  const supabase = await createClient();

  // 1. 캐시에서 정확한 닉네임 조회 시도 (소문자 기반)
  let targetNickname = nickname;
  const { data: cacheData } = await supabase
    .from('pubg_player_cache')
    .select('*')
    .eq('lower_nickname', nickname.toLowerCase())
    .eq('platform', platform)
    .maybeSingle();

  if (cacheData) {
    targetNickname = cacheData.nickname;
    console.log(`[CACHE HIT] ${nickname} -> ${targetNickname}`);
  }

  try {
    // 2. PUBG API 호출 (캐시된 닉네임 우선 사용, 개별 타임아웃 8초로 조정)
    let playerRes = await withRetry(() => fetch(
      `https://api.pubg.com/shards/${platform}/players?filter[playerNames]=${targetNickname}`,
      { 
        headers, 
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(8000)
      }
    ));
    trackPubgRateLimit(playerRes.headers);

    // 3. 캐시된 이름으로 실패 시 원본 입력으로 재시도 (Fallback)
    if (!playerRes.ok && playerRes.status === 404 && targetNickname !== nickname) {
      console.log(`[CACHE STALE] ${targetNickname} 404. Falling back to original: ${nickname}`);
      playerRes = await withRetry(() => fetch(
        `https://api.pubg.com/shards/${platform}/players?filter[playerNames]=${nickname}`,
        { 
          headers, 
          next: { revalidate: 60 },
          signal: AbortSignal.timeout(8000)
        }
      ));
    }

    if (!playerRes.ok) {
      if (playerRes.status === 429) {
        return NextResponse.json(
          { error: "PUBG API 호출 한도가 일시적으로 초과되었습니다. 약 1분 후 다시 시도해 주세요." },
          { status: 429 }
        );
      }
      if (playerRes.status === 404) {
        let suggestions: any[] = [];
        try {
          // [V60.1] pg_trgm 유사도 매칭 RPC 호출로 대소문자가 다르거나 유사한 닉네임 획득
          const { data, error: rpcError } = await supabase.rpc("suggest_similar_players", {
            search_name: nickname,
            search_platform: platform,
            limit_val: 3
          });
          if (rpcError) {
            console.error("[suggest_similar_players RPC Error]:", rpcError);
            throw rpcError;
          }
          if (data) suggestions = data;
        } catch (rpcErr) {
          console.error("[SUGGEST_SIMILAR_PLAYERS_ERROR]", rpcErr);
        }

        return NextResponse.json(
          { 
            error: "존재하지 않는 닉네임입니다. (닉네임 대소문자를 확인해주세요)",
            suggestions 
          },
          { 
            status: 404,
            headers: {
              "Cache-Control": "no-store, max-age=0, must-revalidate"
            }
          }
        );
      }
      throw new Error(`PUBG API 에러: ${playerRes.status}`);
    }
    const playerData = await safeJsonParse(playerRes);
    const accountId = playerData.data[0].id;
    const actualNickname = playerData.data[0].attributes.name;
    const banType = playerData.data[0].attributes?.banType ?? "None";

    // (클랜/무기 데이터 갱신 여부를 포함하여 하단에서 통합 캐시 업데이트를 수행합니다.)

    const recentMatches = playerData.data[0].relationships.matches.data.map(
      (m: any) => m.id
    );

    const seasonRes = await withRetry(() => fetch(
      `https://api.pubg.com/shards/${platform}/seasons`,
      { 
        headers, 
        // Seasons change at most once per patch (months) — cache aggressively to save rate limit
        next: { revalidate: 43200 },
        signal: AbortSignal.timeout(8000)
      }
    ));
    trackPubgRateLimit(seasonRes.headers);
    const seasonData = await safeJsonParse(seasonRes);
    // 🚀 [FIX] pc- 필터링을 완화하여 콘솔(Xbox, PSN) 시즌 데이터도 처리 가능하도록 수정
    const availableSeasons = seasonData.data
      .filter((s: any) => s.id.includes("pc-") || s.id.includes("console-"))
      .sort((a: any, b: any) => b.id.localeCompare(a.id));
    
    if (availableSeasons.length === 0) throw new Error("사용 가능한 시즌 데이터가 없습니다.");

    const currentSeason = availableSeasons.find(
      (s: any) => s.attributes.isCurrentSeason
    ) || availableSeasons[0];
    
    let targetSeasonId = reqSeason || currentSeason.id;

    // 현재 시즌 요청 시 데이터가 없으면 데이터가 있는 최근 시즌 탐색 (최대 3개 시즌)
    if (!reqSeason) {
      try {
        const checkRes = await withRetry(() => fetch(
          `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${targetSeasonId}`,
          { 
            headers, 
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(8000)
          }
        ));
        if (checkRes.ok) {
          const checkData = await safeJsonParse(checkRes);
          const stats = checkData.data.attributes.gameModeStats;
          const hasData = Object.values(stats).some((m: any) => m.roundsPlayed > 0);
          
          if (!hasData) {
            for (let i = 1; i < Math.min(availableSeasons.length, 4); i++) {
              const prevId = availableSeasons[i].id;
              const prevRes = await fetch(
                `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${prevId}`,
                { headers, next: { revalidate: 60 } }
              );
              if (prevRes.ok) {
                const prevData = await safeJsonParse(prevRes);
                if (Object.values(prevData.data.attributes.gameModeStats).some((m: any) => m.roundsPlayed > 0)) {
                  targetSeasonId = prevId;
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Season fallback error:", e);
      }
    }

    // Retrieve clanId from player attributes (NOT relationships — PUBG API spec)
    const clanId: string | null = playerData.data[0].attributes?.clanId ?? null;

    // 캐시 유효성 판단 (클랜 24시간, 무기 숙련도 3시간)
    const CLAN_CACHE_TTL = 24 * 60 * 60 * 1000;
    const MASTERY_CACHE_TTL = 3 * 60 * 60 * 1000;
    const now = Date.now();

    const isClanCacheValid = cacheData?.clan_updated_at && (now - new Date(cacheData.clan_updated_at).getTime() < CLAN_CACHE_TTL);
    const isMasteryCacheValid = cacheData?.mastery_updated_at && (now - new Date(cacheData.mastery_updated_at).getTime() < MASTERY_CACHE_TTL);

    let clanDataPromise: Promise<{ source: string; data: any; updated: boolean }>;
    if (isClanCacheValid && cacheData?.clan_data) {
      console.log(`[CLAN CACHE HIT] Using cached clan data for ${targetNickname}`);
      clanDataPromise = Promise.resolve({ source: 'cache', data: cacheData.clan_data, updated: false });
    } else {
      clanDataPromise = clanId
        ? fetch(`https://api.pubg.com/shards/${platform}/clans/${clanId}`, { headers, next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) })
            .then(async (res) => {
              if (res.ok) {
                const clanJson = await res.json();
                const attr = clanJson.data?.attributes ?? {};
                const parsedClan = {
                  id: clanId,
                  name: attr.clanName ?? "",
                  tag: attr.clanTag ?? "",
                  level: attr.clanLevel ?? 0,
                  memberCount: attr.clanMemberCount ?? 0,
                };
                return { source: 'api', data: parsedClan, updated: true };
              }
              throw new Error(`Clan API Error: ${res.status}`);
            })
            .catch((err) => {
              console.warn(`[CLAN API FAIL] Falling back to DB cache:`, err.message);
              return { source: 'fallback', data: cacheData?.clan_data || null, updated: false };
            })
        : Promise.resolve({ source: 'api', data: null, updated: false });
    }

    let masteryDataPromise: Promise<{ source: string; data: any; updated: boolean }>;
    if (isMasteryCacheValid && cacheData?.weapon_mastery_data) {
      console.log(`[MASTERY CACHE HIT] Using cached mastery data for ${targetNickname}`);
      masteryDataPromise = Promise.resolve({ source: 'cache', data: cacheData.weapon_mastery_data, updated: false });
    } else {
      masteryDataPromise = fetch(
        `https://api.pubg.com/shards/${platform}/players/${accountId}/weapon_mastery`,
        { headers, next: { revalidate: 10800 }, signal: AbortSignal.timeout(8000) }
      )
        .then(async (res) => {
          if (res.ok) {
            const masteryJson = await res.json();
            const summaries: Record<string, any> = masteryJson.data?.attributes?.weaponSummaries ?? {};
            const parsedMastery = Object.entries(summaries)
              .map(([weaponId, data]: [string, any]) => {
                const official = data.OfficialStatsTotal ?? data.StatsTotal ?? {};
                const competitive = data.CompetitiveStatsTotal ?? {};
                return {
                  weaponId,
                  level: data.LevelCurrent ?? 0,
                  xp: data.XPTotal ?? 0,
                  kills: official.Kills ?? 0,
                  damagePlayer: official.DamagePlayer ?? 0,
                  headShots: official.HeadShots ?? 0,
                  longestDefeat: official.LongestKill ?? official.LongestDefeat ?? 0,
                  mostDefeatsInAGame: official.MostKillsInAGame ?? official.MostDefeatsInAGame ?? 0,
                  rankKills: competitive.Kills ?? 0,
                  rankDamagePlayer: competitive.DamagePlayer ?? 0,
                  rankHeadShots: competitive.HeadShots ?? 0,
                  rankLongestDefeat: competitive.LongestKill ?? competitive.LongestDefeat ?? 0,
                  rankMostDefeatsInAGame: competitive.MostKillsInAGame ?? competitive.MostDefeatsInAGame ?? 0,
                };
              })
              .sort((a, b) => {
                const totalKillsA = (a.kills ?? 0) + (a.rankKills ?? 0);
                const totalKillsB = (b.kills ?? 0) + (b.rankKills ?? 0);
                if (totalKillsB !== totalKillsA) return totalKillsB - totalKillsA;
                if (b.level !== a.level) return b.level - a.level;
                return b.xp - a.xp;
              })
              .slice(0, 10);
            return { source: 'api', data: parsedMastery, updated: true };
          }
          throw new Error(`Mastery API Error: ${res.status}`);
        })
        .catch((err) => {
          console.warn(`[MASTERY API FAIL] Falling back to DB cache:`, err.message);
          return { source: 'fallback', data: cacheData?.weapon_mastery_data || [], updated: false };
        });
    }

    // Parallel fetch: ranked, normal season stats + clan info + weapon mastery
    const [rankedRes, normalRes, clanResult, masteryResult] = await Promise.all([
      withRetry(() => fetch(
        `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${targetSeasonId}/ranked`,
        { headers, next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) }
      )),
      withRetry(() => fetch(
        `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${targetSeasonId}`,
        { headers, next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) }
      )),
      clanDataPromise,
      masteryDataPromise,
    ]);
    trackPubgRateLimit(rankedRes.headers);
    trackPubgRateLimit(normalRes.headers);

    const rankedStats = { solo: null as any, duo: null as any, squad: null as any };
    if (rankedRes.ok) {
      const rankedData = await safeJsonParse(rankedRes);
      const allStats = rankedData.data.attributes.rankedGameModeStats;
      // ✅ roundsPlayed 기준으로 더 많이 플레이한 모드 선택 (FPP/TPP 혼용 유저 대응)
      const pickMode = (fpp: any, tpp: any) => {
        if (!fpp && !tpp) return null;
        if (!fpp) return tpp;
        if (!tpp) return fpp;
        return (fpp.roundsPlayed ?? 0) >= (tpp.roundsPlayed ?? 0) ? fpp : tpp;
      };
      rankedStats.solo = pickMode(allStats["solo-fpp"], allStats["solo"]);
      rankedStats.duo  = pickMode(allStats["duo-fpp"],  allStats["duo"]);
      rankedStats.squad = pickMode(allStats["squad-fpp"], allStats["squad"]);
    }

    const normalStats = { solo: null as any, duo: null as any, squad: null as any };
    if (normalRes.ok) {
      const normalData = await safeJsonParse(normalRes);
      const allStats = normalData.data.attributes.gameModeStats;
      // ✅ roundsPlayed 기준으로 더 많이 플레이한 모드 선택 (일반전도 동일 기준 적용)
      const pickMode = (fpp: any, tpp: any) => {
        if (!fpp && !tpp) return null;
        if (!fpp) return tpp;
        if (!tpp) return fpp;
        return (fpp.roundsPlayed ?? 0) >= (tpp.roundsPlayed ?? 0) ? fpp : tpp;
      };
      normalStats.solo  = pickMode(allStats["solo-fpp"],  allStats["solo"]);
      normalStats.duo   = pickMode(allStats["duo-fpp"],   allStats["duo"]);
      normalStats.squad = pickMode(allStats["squad-fpp"], allStats["squad"]);
    }

    const clan = clanResult.data;
    const weaponMastery = masteryResult.data;

    // 4. 캐시 업데이트 (클랜/무기 정보 통합 upsert 및 검색 횟수 누적)
    const currentSearchCount = cacheData?.search_count ?? 0;
    const cacheUpdateData: any = {
      id: accountId,
      platform,
      nickname: actualNickname,
      lower_nickname: actualNickname.toLowerCase(),
      search_count: currentSearchCount + 1,
      updated_at: new Date().toISOString(),
      ban_type: banType
    };
    
    const isNewUser = !cacheData;
    if (clanResult.updated || isNewUser) {
      cacheUpdateData.clan_data = clanResult.data;
      cacheUpdateData.clan_updated_at = new Date().toISOString();
    }
    if (masteryResult.updated || isNewUser) {
      cacheUpdateData.weapon_mastery_data = masteryResult.data;
      cacheUpdateData.mastery_updated_at = new Date().toISOString();
    }

    supabase.from('pubg_player_cache')
      .upsert(cacheUpdateData, { onConflict: 'id' })
      .then(({ error }) => {
        if (error) console.error('[CACHE UPDATE ERROR]', error.message);
      });

    const responseBody = {
      nickname: actualNickname,
      platform,
      seasonId: targetSeasonId,
      seasons: availableSeasons.map((s: any) => ({
        id: s.id,
        name: `Season ${s.id.split("-").pop()}`,
      })),
      stats: { ranked: rankedStats, normal: normalStats },
      recentMatches,
      clan,
      weaponMastery,
      banType,
    };

    // 인메모리 캐시 업데이트
    playerResponseCache.set(cacheKey, {
      timestamp: Date.now(),
      data: responseBody
    });

    return NextResponse.json(responseBody);
  } catch (error: any) {
    const isRateLimit = error.message?.includes("429") || error.status === 429;
    const status = isRateLimit ? 429 : 500;
    const errorMsg = isRateLimit
      ? "PUBG API 호출 한도가 일시적으로 초과되었습니다. 약 1분 후 다시 시도해 주세요."
      : (error.message || "오류가 발생했습니다.");

    // [MONITORING] PUBG API 에러 감지 및 기록
    await reportPubgApiError("/api/pubg/player", status, errorMsg, error.stack || error.message);

    return NextResponse.json(
      { error: errorMsg },
      { status }
    );
  }
}
