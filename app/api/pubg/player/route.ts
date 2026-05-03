// 파일 위치: app/api/pubg/player/route.ts
import { NextResponse } from "next/server";

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

  try {
    const playerRes = await fetch(
      `https://api.pubg.com/shards/${platform}/players?filter[playerNames]=${nickname}`,
      { headers, next: { revalidate: 60 } }
    );
    if (!playerRes.ok)
      throw new Error(
        playerRes.status === 404
          ? "존재하지 않는 닉네임입니다."
          : `API 에러: ${playerRes.status}`
      );
    const playerData = await playerRes.json();
    const accountId = playerData.data[0].id;
    const actualNickname = playerData.data[0].attributes.name;
    const recentMatches = playerData.data[0].relationships.matches.data.map(
      (m: any) => m.id
    );

    const seasonRes = await fetch(
      `https://api.pubg.com/shards/${platform}/seasons`,
      { headers, next: { revalidate: 60 } }
    );
    const seasonData = await seasonRes.json();
    // 🚀 [FIX] pc- 필터링을 완화하여 콘솔(Xbox, PSN) 시즌 데이터도 처리 가능하도록 수정
    const availableSeasons = seasonData.data
      .filter((s: any) => s.id.includes("pc-") || s.id.includes("console-"))
      .sort((a: any, b: any) => b.id.localeCompare(a.id));
    
    if (availableSeasons.length === 0) throw new Error("사용 가능한 시즌 데이터가 없습니다.");

    const currentSeason = availableSeasons.find(
      (s: any) => s.attributes.isCurrentSeason
    ) || availableSeasons[0];
    const targetSeasonId = reqSeason || currentSeason.id;

    // 🚀 핵심: 경쟁전과 일반전 API를 '동시에' 찔러서 속도를 높입니다!
    const [rankedRes, normalRes] = await Promise.all([
      fetch(
        `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${targetSeasonId}/ranked`,
        { headers, next: { revalidate: 60 } }
      ),
      fetch(
        `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${targetSeasonId}`,
        { headers, next: { revalidate: 60 } }
      ),
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
        name: s.id.split("-").pop(),
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
