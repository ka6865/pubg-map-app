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
  // ✅ [V14 최적화] data JSONB 전체 대신 matchType 경로만 추출 → DB 전송량 90% 감소
  const { data: processedMatches, error: processedError } = await supabase
    .from("processed_match_telemetry")
    .select("match_id, data->fullResult->matchType");

  if (processedError || !processedMatches) {
    console.error("❌ 처리된 매치 조회 에러:", processedError);
    return;
  }

  const competitiveMatchIds = processedMatches
    .filter((m: any) => m.matchType === "competitive")
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

    // [V14] DB가 비어있으면 스토리지에서 _map.json의 zoneEvents를 직접 활용 (API 호출 없이 처리)
    if (!events || !Array.isArray(events) || events.length === 0) {
      const mapCachePath = `${match.match_id}_map.json`;
      const { data: fileData } = await supabase.storage
        .from('telemetry')
        .download(mapCachePath);

      if (fileData) {
        const text = await fileData.text();
        const parsed = JSON.parse(text);
        // ✅ _map.json에는 zoneEvents가 이미 파싱된 형태로 저장되어 있음
        // zoneEvents: [{ relativeTimeMs, whiteX, whiteY, whiteRadius, blueX, blueY, blueRadius, isZoneMoving, nextPhaseRelativeMs }]
        // 이를 바탕으로 phases를 로고 없이 로컈 소스에서 직접 구성
        if (parsed.zoneEvents && Array.isArray(parsed.zoneEvents) && parsed.zoneEvents.length > 0) {
          const matchData: any = {
            matchId: match.match_id,
            mapName: match.map_name,
            flightPath: null, // 원본 데이터 없으면 비행경로 추정 불가
            phases: []
          };

          // 페이즈 변환은 whiteRadius 변화량 8% 기준으로 예역하여 실제 페이즈를 원본 PUBG 로그 방식대로 추정
          let lastWhiteRadius: number | null = null;
          let currentPhaseIdx = 0;

          for (const ze of parsed.zoneEvents) {
            const wr = ze.whiteRadius;
            if (wr == null || wr <= 0) continue;

            if (lastWhiteRadius === null) {
              lastWhiteRadius = wr;
              matchData.phases.push({
                phase: currentPhaseIdx,
                // 안전구역(white) 중심이 다음 자기장 위치 (PUBG 게임 로직)
                x: ze.whiteX,
                y: ze.whiteY,
                radius: wr
              });
            } else {
              const changePct = Math.abs(wr - lastWhiteRadius) / Math.max(lastWhiteRadius, 1);
              if (changePct > 0.08) {
                currentPhaseIdx++;
                lastWhiteRadius = wr;
                const existingIdx = matchData.phases.findIndex((p: any) => p.phase === currentPhaseIdx);
                const phaseData = { phase: currentPhaseIdx, x: ze.whiteX, y: ze.whiteY, radius: wr };
                if (existingIdx === -1) matchData.phases.push(phaseData);
                else matchData.phases[existingIdx] = phaseData;
              }
            }
          }

          if (matchData.phases.length > 0) {
            allMatches.push(matchData);
            continue; // 이미 처리되었으만 PUBG API 호출 안 함
          }
        }
      }
    }

    // 위를 모두 실패했을 때만 PUBG API 호출 (rate limit 고려)
    if (!events || !Array.isArray(events) || events.length === 0) {
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
      // ✅ 공식 PUBG API 기준: safetyZone = White(안전구역/흰원), poisonGasWarning = Blue(자기장/파란원)
      // 시뮬레이터의 phases 좌표 = 안전구역(safetyZone) 중심 — 다음 자기장이 수렴할 목표 지점
      if (e._T === "LogGameStatePeriodic" && (e.gameState?.safetyZoneRadius ?? 0) > 0) {
        const gs = e.gameState;
        const existingPhaseIndex = matchData.phases.findIndex((p: any) => p.phase === currentPhase);
        const phaseData = {
          phase: currentPhase,
          // ✅ 안전구역(White) 중심이 다음 자기장 수렴 위치
          x: gs.safetyZonePosition?.x ?? 0,
          y: gs.safetyZonePosition?.y ?? 0,
          radius: gs.safetyZoneRadius ?? 0
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
