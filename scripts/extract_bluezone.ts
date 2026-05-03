import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function extractSimulatorData() {
  console.log("🚀 [Bluezone Extractor] 자기장 데이터 추출 시작...");

  // [V13] 기존 데이터 로드 (누적 방식: 스토리지 우선)
  let allMatches: any[] = [];
  const outputPath = path.resolve(process.cwd(), "public/bluezone_data.json");
  
  try {
    console.log("☁️ 스토리지에서 기존 데이터 확인 중...");
    const { data: storageData } = await supabase.storage
      .from("app-data")
      .download("bluezone_data.json");

    if (storageData) {
      const text = await storageData.text();
      allMatches = JSON.parse(text);
      console.log(`📦 스토리지에서 기존 데이터 ${allMatches.length}건 로드 완료.`);
    } else if (fs.existsSync(outputPath)) {
      const existingData = fs.readFileSync(outputPath, "utf8");
      allMatches = JSON.parse(existingData);
      console.log(`📦 로컬에서 기존 데이터 ${allMatches.length}건 로드 완료.`);
    }
  } catch (e) {
    console.log("ℹ️ 기존 데이터가 없거나 형식이 잘못되어 새로 시작합니다.");
  }

  const existingMatchIds = new Set(allMatches.map((m: any) => m.matchId));
  
  console.log("DB에서 매치 ID 목록을 가져오는 중...");
  
  // 1. processed_match_telemetry에서 competitive 매치 ID만 필터링
  const { data: processedMatches, error: processedError } = await supabase
    .from("processed_match_telemetry")
    .select("match_id, data");

  if (processedError || !processedMatches) {
    console.error("❌ 처리된 매치 조회 에러:", processedError);
    return;
  }

  const competitiveMatchIds = processedMatches
    .filter((m: any) => m.data?.fullResult?.matchType === "competitive" || m.data?.matchType === "competitive")
    .map((m: any) => m.match_id);

  console.log(`경쟁전(Competitive) 매치 ${competitiveMatchIds.length}개 발견. 텔레메트리 파싱 시작...`);

  // 2. match_master_telemetry에서 각 매치의 맵 정보 조회 (Batching 적용하여 HeadersOverflow 방지)
  const matches: any[] = [];
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < competitiveMatchIds.length; i += BATCH_SIZE) {
    const batchIds = competitiveMatchIds.slice(i, i + BATCH_SIZE);
    const { data: batchData, error: matchError } = await supabase
      .from("match_master_telemetry")
      .select("match_id, map_name")
      .in("match_id", batchIds);

    if (matchError) {
      console.error(`❌ 매치 ID 조회 에러 (Batch ${i}):`, matchError);
      continue;
    }
    if (batchData) {
      matches.push(...batchData);
    }
  }

  if (matches.length === 0) {
    console.error("❌ 조회된 매치 데이터가 없습니다.");
    return;
  }

  console.log(`총 ${matches.length}개의 매치 발견. 텔레메트리 파싱 시작...`);

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    
    // [V13] 이미 처리된 매치는 스킵
    if (existingMatchIds.has(match.match_id)) {
      continue;
    }

    if (i % 10 === 0) console.log(`진행 상황: ${i} / ${matches.length} (${Math.round(i/matches.length*100)}%)`);

    const { data, error } = await supabase
      .from("match_master_telemetry")
      .select("telemetry_events")
      .eq("match_id", match.match_id)
      .single();

    if (error || !data) {
      continue;
    }

    let events = data.telemetry_events;

    // [V12] DB가 비어있으면 스토리지 또는 PUBG API에서 가져오기
    if (!events || !Array.isArray(events) || events.length === 0) {
      const mapCachePath = `${match.match_id}_map.json`;
      const { data: fileData } = await supabase.storage
        .from('telemetry')
        .download(mapCachePath);

      if (fileData) {
        const text = await fileData.text();
        const parsed = JSON.parse(text);
        // _map.json은 이미 파싱된 형태이므로 원본 이벤트 구조가 아닐 수 있음
        // 만약 원본이 필요하면 PUBG API로 가야함
        if (parsed.events) events = parsed.events; 
      }

      // 그래도 없으면 PUBG API 호출 (속도는 느리지만 확실함)
      if (!events || events.length === 0) {
        try {
          const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
          const matchRes = await fetch(`https://api.pubg.com/shards/steam/matches/${match.match_id}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" }
          });
          const matchDetail = await matchRes.json();
          const asset = matchDetail.included.find((i: any) => i.type === "asset");
          if (asset) {
            const telRes = await fetch(asset.attributes.URL);
            events = await telRes.json();
            console.log(`☁️ Fetched ${match.match_id} directly from PUBG API.`);
          }
        } catch (e) {
          console.error(`❌ Failed to fetch fallback for ${match.match_id}`);
        }
      }
    }

    if (!events || !Array.isArray(events) || events.length === 0) continue;

    // 1. 비행기 경로 추론 (각 플레이어의 최초 발견 위치 기반 선형 회귀)
    const firstLocs = new Map();
    for (const e of events) {
      if (e.character?.name && e.character?.loc && !firstLocs.has(e.character.name)) {
        firstLocs.set(e.character.name, e.character.loc);
      }
      if (e.attacker?.name && e.attacker?.loc && !firstLocs.has(e.attacker.name)) {
        firstLocs.set(e.attacker.name, e.attacker.loc);
      }
      if (e.victim?.name && e.victim?.loc && !firstLocs.has(e.victim.name)) {
        firstLocs.set(e.victim.name, e.victim.loc);
      }
    }

    let flightPath = null;
    if (firstLocs.size > 10) {
      const pts = Array.from(firstLocs.values());
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
        
        let minT = Infinity, maxT = -Infinity;
        for (const p of pts) {
          const t = (p.x - meanX) * dx + (p.y - meanY) * dy;
          if (t < minT) minT = t;
          if (t > maxT) maxT = t;
        }
        
        flightPath = [
          { lat: Math.round(meanY + dy * minT), lng: Math.round(meanX + dx * minT) },
          { lat: Math.round(meanY + dy * maxT), lng: Math.round(meanX + dx * maxT) }
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
      if (e._T === "LogPhaseChange") {
        currentPhase = e.phase;
      }
      if (e._T === "LogGameStatePeriodic" && e.gameState?.safetyZoneRadius > 0) {
        const existingPhaseIndex = matchData.phases.findIndex((p: any) => p.phase === currentPhase);
        const phaseData = {
          phase: currentPhase,
          x: e.gameState.safetyZonePosition.x,
          y: e.gameState.safetyZonePosition.y,
          radius: e.gameState.safetyZoneRadius
        };

        if (existingPhaseIndex === -1) {
          matchData.phases.push(phaseData);
        } else {
          matchData.phases[existingPhaseIndex] = phaseData;
        }
      }
    });

    if (matchData.phases.length > 0) {
      allMatches.push(matchData);
    }
  }

  // 맵별 데이터 개수 통계
  const mapStats = allMatches.reduce((acc: any, match: any) => {
    acc[match.mapName] = (acc[match.mapName] || 0) + 1;
    return acc;
  }, {});

  console.log("\n📊 [추출 결과 요약]");
  console.log(`총 추출된 매치 수: ${allMatches.length} 건`);
  console.table(mapStats);

  // JSON 파일로 저장 (로컬)
  fs.writeFileSync(outputPath, JSON.stringify(allMatches, null, 2));
  console.log(`\n✅ 로컬 데이터 추출 완료! 저장 위치: ${outputPath}`);

  // Supabase Storage에 업로드 (app-data 버킷)
  console.log("☁️ Supabase Storage에 업로드 중...");
  const { error: uploadError } = await supabase.storage
    .from("app-data")
    .upload("bluezone_data.json", JSON.stringify(allMatches), {
      contentType: "application/json",
      upsert: true,
    });

  if (uploadError) {
    console.error("❌ Storage 업로드 에러:", uploadError);
  } else {
    console.log("✅ Supabase Storage 업로드 완료!");
  }
}

extractSimulatorData();
