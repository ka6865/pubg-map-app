import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TELEMETRY_VERSION } from "@/lib/pubg-analysis/constants";
import { normalizeName } from "@/lib/pubg-analysis/utils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const nickname = searchParams.get("nickname");
  const mapName = searchParams.get("mapName") || "Erangel";
  const platform = searchParams.get("platform") || "steam";
  const mode = searchParams.get("mode") || "lite";

  if (!matchId || !nickname) {
    return NextResponse.json(
      { error: "matchId와 nickname 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const lowerNickname = normalizeName(nickname);

  const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/vnd.api+json",
  };

  try {
    // 1. 매치 정보를 가져와서 팀원 ID 목록과 텔레메트리 URL을 확보
    const matchRes = await fetch(
      `https://api.pubg.com/shards/${platform}/matches/${matchId}`,
      { headers, next: { revalidate: 3600 } }
    );
    if (!matchRes.ok) throw new Error("매치 정보를 불러올 수 없습니다.");
    const matchData = await matchRes.json();

    const participants = matchData.included.filter(
      (item: any) => item.type === "participant"
    );
    const rosters = matchData.included.filter((item: any) => item.type === "roster");
    
    // 에셋(텔레메트리 파일) 찾기
    const assets = matchData.included.filter((item: any) => item.type === "asset");
    if (!assets || assets.length === 0) throw new Error("텔레메트리 데이터가 존재하지 않습니다.");
    const telemetryUrl = assets[0].attributes.URL;

    // 내 데이터 찾기
    const myInfo = participants.find((p: any) => p.attributes.stats.name === nickname);
    if (!myInfo) throw new Error("플레이어 데이터를 찾을 수 없습니다.");

    // 1-1. 캐시 확인 (DB/Storage) - V26.0 버전 기반 무효화 적용
    const mapCachePath = `${matchId}_${lowerNickname}_v${TELEMETRY_VERSION}_map.json`;
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('telemetry')
      .download(mapCachePath);

    if (!downloadError && fileData) {
      const text = await fileData.text();
      return NextResponse.json(JSON.parse(text), {
        headers: { "Cache-Control": "no-store" }
      });
    }

    // 2. 캐시가 없으면 PUBG API에서 직접 다운로드 및 엔진 실행
    const telemetryRes = await fetch(telemetryUrl, { cache: "no-store" });
    if (!telemetryRes.ok) throw new Error("텔레메트리 JSON 파일 다운로드 실패");
    const events = await telemetryRes.json();

    // [V26.0] 엔진을 통한 통합 분석 실행
    const { AnalysisEngine } = await import("@/lib/pubg-analysis/AnalysisEngine");
    const engine = new AnalysisEngine(nickname, myInfo.attributes.stats.playerId, new Set(), new Set(), new Set(), new Set(), "");
    const result = engine.run(events, matchData.data.attributes, rosters, participants, myInfo.attributes.stats, [], { avg_damage: 200 });

    const finalData = {
      matchId,
      startTime: matchData.data.attributes.createdAt,
      teammates: result.mapData.teammates,
      teamNames: [nickname],
      events: result.mapData.events,
      zoneEvents: result.mapData.zoneEvents,
    };

    // [V26.0] 파싱된 최종 결과물을 스토리지에 저장
    await supabase.storage.from('telemetry').upload(mapCachePath, JSON.stringify(finalData), {
      contentType: 'application/json',
      upsert: true
    });

    return NextResponse.json(finalData, {
      headers: { "Cache-Control": "no-store" }
    });

  } catch (error: any) {
    console.error("Telemetry Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
