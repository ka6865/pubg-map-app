// 파일 위치: app/api/pubg/match/route.ts
import { NextResponse } from "next/server";

const MAP_NAMES: Record<string, string> = {
  Baltic_Main: "에란겔",
  Desert_Main: "미라마",
  Savage_Main: "사녹",
  DihorOtok_Main: "비켄디",
  Tiger_Main: "태이고",
  Kiki_Main: "데스턴",
  Neon_Main: "론도",
  Chimera_Main: "파라모",
  Heaven_Main: "헤이븐",
  Summerland_Main: "카라킨",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const nickname = searchParams.get("nickname");
  const platform = searchParams.get("platform") || "steam";

  if (!matchId || !nickname)
    return NextResponse.json(
      { error: "파라미터가 부족합니다." },
      { status: 400 }
    );

  // 환경 변수에서 불필요한 공백 및 텍스트(예: "Rate Limit 10 RPM...")를 제거하고 진짜 토큰만 추출
  const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/vnd.api+json",
  };

  try {
    const res = await fetch(
      `https://api.pubg.com/shards/${platform}/matches/${matchId}`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) throw new Error("매치 정보를 불러올 수 없습니다.");
    const data = await res.json();

    const matchAttr = data.data.attributes;
    const mapName = MAP_NAMES[matchAttr.mapName] || matchAttr.mapName;
    const createdAt = matchAttr.createdAt;

    // 1 전체 참가자(Participant)와 팀 그룹(Roster)을 분류
    const participants = data.included.filter(
      (item: any) => item.type === "participant"
    );
    const rosters = data.included.filter((item: any) => item.type === "roster");

    // 2 내 데이터 찾기
    const myInfo = participants.find(
      (p: any) => p.attributes.stats.name === nickname
    );
    if (!myInfo) throw new Error("플레이어 데이터를 찾을 수 없습니다.");

    // 3 내가 속한 팀(Roster) 찾기
    const myRoster = rosters.find((r: any) =>
      r.relationships.participants.data.some((p: any) => p.id === myInfo.id)
    );

    // 4️ 우리 팀원들 데이터만 쏙쏙 뽑아오기
    let teamStats = [];
    if (myRoster) {
      teamStats = myRoster.relationships.participants.data
        .map((pRef: any) => {
          const member = participants.find((p: any) => p.id === pRef.id);
          return member ? member.attributes.stats : null;
        })
        .filter(Boolean);
    } else {
      teamStats = [myInfo.attributes.stats]; // 솔로일 경우 나 혼자
    }

    // 5 팀 전체 킬/데미지 합산
    const totalTeamKills = teamStats.reduce(
      (sum: any, member: any) => sum + member.kills,
      0
    );
    const totalTeamDamage = teamStats.reduce(
      (sum: any, member: any) => sum + member.damageDealt,
      0
    );

    return NextResponse.json({
      matchId,
      mapName,
      createdAt,
      gameMode: matchAttr.gameMode,
      stats: myInfo.attributes.stats,
      team: teamStats, // 팀원들 전체 기록
      totalTeamKills, // 팀 총 킬
      totalTeamDamage, // 팀 총 데미지
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
