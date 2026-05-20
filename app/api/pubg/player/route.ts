import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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
    .select('nickname')
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
      if (playerRes.status === 404) {
        return NextResponse.json(
          { error: "존재하지 않는 닉네임입니다. (닉네임 대소문자를 확인해주세요)" },
          { status: 404 }
        );
      }
      throw new Error(`PUBG API 에러: ${playerRes.status}`);
    }
    const playerData = await playerRes.json();
    const accountId = playerData.data[0].id;
    const actualNickname = playerData.data[0].attributes.name;

    // 4. 캐시 업데이트 (비동기)
    supabase.from('pubg_player_cache').upsert({
      id: accountId,
      platform,
      nickname: actualNickname,
      lower_nickname: actualNickname.toLowerCase(),
      updated_at: new Date().toISOString()
    }).then(({ error }) => {
      if (error) console.error('[CACHE UPDATE ERROR]', error);
    });

    const recentMatches = playerData.data[0].relationships.matches.data.map(
      (m: any) => m.id
    );

    const seasonRes = await withRetry(() => fetch(
      `https://api.pubg.com/shards/${platform}/seasons`,
      { 
        headers, 
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(8000)
      }
    ));
    const seasonData = await seasonRes.json();
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
          const checkData = await checkRes.json();
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
                const prevData = await prevRes.json();
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

    const [rankedRes, normalRes] = await Promise.all([
      withRetry(() => fetch(
        `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${targetSeasonId}/ranked`,
        { headers, next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) }
      )),
      withRetry(() => fetch(
        `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${targetSeasonId}`,
        { headers, next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) }
      )),
    ]);

    const rankedStats = { solo: null as any, duo: null as any, squad: null as any };
    if (rankedRes.ok) {
      const rankedData = await rankedRes.json();
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
      const normalData = await normalRes.json();
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

    return NextResponse.json({
      nickname: actualNickname,
      platform,
      seasonId: targetSeasonId,
      seasons: availableSeasons.map((s: any) => ({
        id: s.id,
        name: `Season ${s.id.split("-").pop()}`,
      })),
      stats: { ranked: rankedStats, normal: normalStats },
      recentMatches,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
