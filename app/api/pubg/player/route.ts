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
      { headers, cache: "no-store" }
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
      { headers, cache: "no-store" }
    );
    const seasonData = await seasonRes.json();
    const pcSeasons = seasonData.data
      .filter((s: any) => s.id.includes("pc-"))
      .sort((a: any, b: any) => b.id.localeCompare(a.id));
    const currentSeason = pcSeasons.find(
      (s: any) => s.attributes.isCurrentSeason
    );
    const targetSeasonId = reqSeason || currentSeason.id;

    // 🚀 핵심: 경쟁전과 일반전 API를 '동시에' 찔러서 속도를 높입니다!
    const [rankedRes, normalRes] = await Promise.all([
      fetch(
        `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${targetSeasonId}/ranked`,
        { headers, cache: "no-store" }
      ),
      fetch(
        `https://api.pubg.com/shards/${platform}/players/${accountId}/seasons/${targetSeasonId}`,
        { headers, cache: "no-store" }
      ),
    ]);

    let rankedStats = { solo: null, duo: null, squad: null };
    if (rankedRes.ok) {
      const rankedData = await rankedRes.json();
      const allStats = rankedData.data.attributes.rankedGameModeStats;
      rankedStats.solo = allStats["solo"] || null;
      rankedStats.duo = allStats["duo"] || null;
      rankedStats.squad = allStats["squad"] || null;
    }

    let normalStats = { solo: null, duo: null, squad: null };
    if (normalRes.ok) {
      const normalData = await normalRes.json();
      const allStats = normalData.data.attributes.gameModeStats;
      normalStats.solo = allStats["solo"] || null;
      normalStats.duo = allStats["duo"] || null;
      normalStats.squad = allStats["squad"] || null;
    }

    return NextResponse.json({
      nickname: actualNickname,
      platform,
      seasonId: targetSeasonId,
      seasons: pcSeasons.map((s: any) => ({
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
