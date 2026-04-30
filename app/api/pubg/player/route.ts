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

    const rankedStats = { solo: null, duo: null, squad: null };
    if (rankedRes.ok) {
      const rankedData = await rankedRes.json();
      const allStats = rankedData.data.attributes.rankedGameModeStats;
      // TPP와 FPP 중 데이터가 존재하는 것을 선택 (또는 합산 가능하지만 랭크는 보통 하나만 플레이함)
      rankedStats.solo = allStats["solo-fpp"] || allStats["solo"] || null;
      rankedStats.duo = allStats["duo-fpp"] || allStats["duo"] || null;
      rankedStats.squad = allStats["squad-fpp"] || allStats["squad"] || null;
    }

    const normalStats = { solo: null, duo: null, squad: null };
    if (normalRes.ok) {
      const normalData = await normalRes.json();
      const allStats = normalData.data.attributes.gameModeStats;
      // 일반전은 1인칭/3인칭 데이터가 공존할 수 있으므로, 더 많이 플레이한 쪽을 보여주거나 간단히 합산 로직 적용
      // 여기서는 유효한 데이터가 있는 쪽을 우선시함
      normalStats.solo = allStats["solo-fpp"] || allStats["solo"] || null;
      normalStats.duo = allStats["duo-fpp"] || allStats["duo"] || null;
      normalStats.squad = allStats["squad-fpp"] || allStats["squad"] || null;
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
