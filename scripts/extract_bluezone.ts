import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAP_NAME_MAP: Record<string, string> = {
  "에란겔": "Baltic_Main",
  "미라마": "Desert_Main",
  "태이고": "Tiger_Main",
  "사녹": "Savage_Main",
  "비켄디": "DihorOtok_Main",
  "론도": "Neon_Main",
  "데스턴": "Kiki_Main",
  "파라모": "Range_Main",
  "카라킨": "Summerland_Main"
};

async function extractSimulatorData() {
  console.log("🚀 [Bluezone Extractor] 자기장 데이터 추출 시작...");

  let rawMatches: any[] = [];
  const outputPath = path.resolve(process.cwd(), "public/bluezone_data_v2.json");
  
  try {
    const { data: storageData } = await supabase.storage
      .from("app-data")
      .download("bluezone_data_v2.json");

    if (storageData) {
      const text = await storageData.text();
      rawMatches = JSON.parse(text);
      console.log(`📦 스토리지에서 기존 데이터 ${rawMatches.length}건 로드 완료.`);
    } else if (fs.existsSync(outputPath)) {
      rawMatches = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
    }
  } catch (e) {}

  const matchMap = new Map();
  rawMatches.forEach((m: any) => {
    if (m.matchId && m.mapName) {
      matchMap.set(m.matchId, m);
    }
  });
  const allMatches = Array.from(matchMap.values());

  console.log("DB에서 매치 정보를 가져오는 중...");
  
  const { data: processedMatches } = await supabase
    .from("processed_match_telemetry")
    .select("match_id, data->fullResult->mapName");

  const matches = (processedMatches || [])
    .map(m => {
      const korName = (m as any).mapName;
      return { 
        match_id: m.match_id, 
        map_name: MAP_NAME_MAP[korName] || korName || '' 
      };
    })
    .filter(m => m.map_name !== '');

  console.log(`총 ${matches.length}개의 매치 발견.`);

  let processedCount = 0;
  const PROCESS_LIMIT = 150;

  const prioritizedMatches = matches.sort((a, b) => {
    const priorityMaps = ['Baltic_Main', 'Tiger_Main'];
    const aPri = priorityMaps.includes(a.map_name) ? 0 : 1;
    const bPri = priorityMaps.includes(b.map_name) ? 0 : 1;
    return aPri - bPri;
  });

  for (const match of prioritizedMatches) {
    if (allMatches.some(m => m.matchId === match.match_id && m.flightPath !== null)) continue;
    if (processedCount >= PROCESS_LIMIT) break;

    const { data } = await supabase
      .from("match_master_telemetry")
      .select("telemetry_events")
      .eq("match_id", match.match_id)
      .single();

    let events = data?.telemetry_events || [];

    if (events.length === 0) {
      try {
        const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
        const matchRes = await fetch(`https://api.pubg.com/shards/steam/matches/${match.match_id}`, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" }
        });
        if (matchRes.ok) {
          const matchJson = await matchRes.json();
          const asset = matchJson.included.find((item: any) => item.type === "asset");
          if (asset?.attributes?.URL) {
            const telemetryRes = await fetch(asset.attributes.URL);
            if (telemetryRes.ok) events = await telemetryRes.json();
          }
        }
      } catch (e) {}
    }

    if (!events || events.length === 0) continue;

    processedCount++;
    console.log(`[${processedCount}/${PROCESS_LIMIT}] ${match.map_name} 추출 중... (${match.match_id})`);

    const airplaneLocs: any[] = [];
    const startTime = events.length > 0 ? new Date(events[0]._D || events[0].Timestamp).getTime() : 0;

    for (const e of events) {
      if ((e._T || e.Type) === "LogPlayerPosition") {
        const char = e.character;
        const time = new Date(e._D || e.Timestamp).getTime();
        if (char?.location && char.location.z > 20000 && (time - startTime < 120000)) {
          airplaneLocs.push({ x: char.location.x, y: char.location.y, time });
        }
      }
    }

    let flightPath = null;
    if (airplaneLocs.length > 20) {
      airplaneLocs.sort((a, b) => a.time - b.time);
      const pts = airplaneLocs;
      const meanX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
      const meanY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
      let num = 0, den = 0;
      for (const p of pts) {
        num += (p.x - meanX) * (p.y - meanY);
        den += (p.x - meanX) * (p.x - meanX);
      }
      if (den !== 0) {
        const m = num / den;
        const len = Math.sqrt(1 + m*m);
        const dx = 1 / len;
        const dy = m / len;
        // 선을 맵 끝까지 연장 (x가 0 또는 819200인 지점까지)
        // x = 0일 때 y = meanY + m * (0 - meanX)
        // x = 819200일 때 y = meanY + m * (819200 - meanX)
        const xStart = 0;
        const yStart = meanY + m * (xStart - meanX);
        const xEnd = 819200;
        const yEnd = meanY + m * (xEnd - meanX);

        flightPath = [
          { y: Math.round(yStart / 100), x: Math.round(xStart / 100) },
          { y: Math.round(yEnd / 100), x: Math.round(xEnd / 100) }
        ];
      }
    }

    const matchData: any = {
      matchId: match.match_id,
      mapName: match.map_name,
      flightPath: flightPath,
      phases: []
    };

    let currentPhase = 0;
    events.forEach((e: any) => {
      if (e._T === "LogPhaseChange") currentPhase = e.phase;
      if (e._T === "LogGameStatePeriodic" && (e.gameState?.safetyZoneRadius ?? 0) > 0) {
        const gs = e.gameState;
        const phaseData = {
          phase: currentPhase,
          x: Math.round((gs.safetyZonePosition?.x ?? 0) / 100),
          y: Math.round((gs.safetyZonePosition?.y ?? 0) / 100),
          radius: Math.round((gs.safetyZoneRadius ?? 0) / 100)
        };
        const existingIdx = matchData.phases.findIndex((p: any) => p.phase === currentPhase);
        if (existingIdx === -1) matchData.phases.push(phaseData);
        else matchData.phases[existingIdx] = phaseData;
      }
    });

    if (matchData.phases.length > 0) {
      const idx = allMatches.findIndex(m => m.matchId === matchData.matchId);
      if (idx > -1) allMatches[idx] = matchData;
      else allMatches.push(matchData);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(allMatches, null, 2));
  await supabase.storage.from("app-data").upload("bluezone_data_v2.json", JSON.stringify(allMatches), {
    contentType: "application/json",
    upsert: true,
  });
  console.log(`✅ ${processedCount}건 복구 및 업로드 완료! (총 ${allMatches.length}건)`);
}

extractSimulatorData();
