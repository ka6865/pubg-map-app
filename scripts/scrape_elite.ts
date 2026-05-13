// scripts/scrape_elite.ts
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { RESULT_VERSION } from '../lib/pubg-analysis/constants';

// .env 및 .env.local 파일의 환경변수 로드
dotenv.config({ path: '.env.local' });
dotenv.config();

const PUBG_API_KEY = process.env.PUBG_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BASE_URL = "https://api.pubg.com/shards/steam";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const MATCH_API_URL = `${APP_URL}/api/pubg/match`;

if (!PUBG_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("🚨 환경변수(PUBG_API_KEY, SUPABASE_URL, KEY)가 설정되어 있지 않습니다.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEADERS = {
  Authorization: `Bearer ${PUBG_API_KEY}`,
  Accept: "application/vnd.api+json",
};

// [설정] 실행 모드에 따른 제한값 (기본값은 수동 실행용 Full 모드)
const PLAYER_LIMIT = parseInt(process.env.ELITE_PLAYER_LIMIT || '10');
const MATCH_LIMIT = parseInt(process.env.ELITE_MATCH_LIMIT || '10');
const ENABLE_SAMPLING = process.env.ENABLE_SAMPLING === 'true' || !process.env.ELITE_PLAYER_LIMIT; 

console.log(`📊 실행 모드: ${process.env.ELITE_PLAYER_LIMIT ? 'DAILY (Light)' : 'MANUAL (Full)'}`);
console.log(`👥 인원: ${PLAYER_LIMIT}, 🎮 매치: ${MATCH_LIMIT}, 🧪 샘플링: ${ENABLE_SAMPLING}`);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sampleParticipants(rawStats: any[], excludeName: string): string[] {
  // rawStats는 이미 damage 내림차순 정렬된 상태로 가정
  const n = rawStats.length;
  if (n === 0) return [];

  const sIndex = Math.floor(n * 0.05); // S티어 후보
  const bIndex = Math.floor(n * 0.40); // B티어 후보
  const cIndex = Math.floor(n * 0.70); // C티어 후보

  const reps = new Set<string>();
  
  if (rawStats[sIndex] && rawStats[sIndex].player_id !== excludeName) reps.add(rawStats[sIndex].player_id);
  if (rawStats[bIndex] && rawStats[bIndex].player_id !== excludeName) reps.add(rawStats[bIndex].player_id);
  if (rawStats[cIndex] && rawStats[cIndex].player_id !== excludeName) reps.add(rawStats[cIndex].player_id);

  return Array.from(reps).slice(0, 3);
}

async function scrapeEliteData() {
  console.log("🚀 [BGMS Smart Scraper] 작업을 시작합니다...");

  try {
    const seasonRes = await axios.get(`${BASE_URL}/seasons`, { headers: HEADERS });
    const currentSeason = seasonRes.data.data.find((s: any) => s.attributes.isCurrentSeason);
    if (!currentSeason) return;
    
    const seasonId = currentSeason.id;
    console.log(`✅ 현재 시즌: ${seasonId}`);

    const gameModes = ["squad", "squad-fpp", "solo", "solo-fpp", "duo", "duo-fpp"]; 
    const playerPool = new Map<string, string>();
    
    // [V36.5] 일반 및 경쟁전 리더보드 통합 수집
    for (const mode of gameModes) {
      console.log(`📡 [${mode}] 리더보드 조회 중...`);
      try {
        // 1. 일반 리더보드
        const leaderboardRes = await axios.get(`https://api.pubg.com/shards/pc-as/leaderboards/${seasonId}/${mode}`, { headers: HEADERS });
        const modePlayers = leaderboardRes.data.included?.filter((i: any) => i.type === "player").slice(0, PLAYER_LIMIT) || [];
        modePlayers.forEach((p: any) => playerPool.set(p.id, p.attributes.name));
        
        // 2. 경쟁전 리더보드 (일부 모드만 지원)
        if (mode.includes("squad")) {
          // 경쟁전은 보통 동일 시즌 ID를 공유하거나 약간의 딜레이가 있을 수 있음
          // pc-as 샤드의 경우 리더보드에서 경쟁전 데이터가 별도로 존재함
        }
      } catch (err) {}
    }

    console.log(`🎯 총 ${playerPool.size}명의 타겟 플레이어 확보.`);

    for (const [accountId, nickname] of playerPool.entries()) {
      console.log(`\n🔍 [${nickname}] 매치 스캔 중...`);
      await sleep(3000); // 플레이어 간 간격

      let matchIds: string[] = [];
      try {
        const pDetails = await axios.get(`${BASE_URL}/players/${accountId}`, { headers: HEADERS });
        matchIds = pDetails.data.data.relationships.matches.data.slice(0, MATCH_LIMIT).map((m: any) => m.id);
      } catch (err) { continue; }

      for (const matchId of matchIds) {
        // [최적화 1] DB 중복 체크 (V11.6 미만이면 재분석 수행)
        const { data: existing } = await supabase
          .from("processed_match_telemetry")
          .select("data")
          .eq("match_id", matchId)
          .eq("player_id", nickname.toLowerCase().trim())
          .single();

        if (existing && (existing.data?.fullResult?.v || 0) >= RESULT_VERSION) {
          console.log(`   - MatchID(${matchId}): 최신 데이터 존재 (Skip)`);
          continue;
        }

        if (existing) {
          console.log(`   - MatchID(${matchId}): 구버전 발견(${existing.data?.fullResult?.v || "unknown"}) -> V${RESULT_VERSION} 재분석 시작...`);
        } else {
          console.log(`   - MatchID(${matchId}): 신규 수집 시작...`);
        }
        
        try {
          // [최적화 2] 로컬 서버 API 호출 (동기적으로 대기)
          const res = await axios.get(`${MATCH_API_URL}?matchId=${matchId}&nickname=${encodeURIComponent(nickname.trim())}&platform=steam`);
          
          if (res.status === 200) {
            const d = res.data;
            console.log(`     ✅ 성공: (딜량: ${Math.round(d.stats.damageDealt)}, 생존: ${d.deathPhase}Ph)`);

            // [Phase 4] 매치 참가자 샘플링 추가 (S, B 대표)
            const { data: rawStats } = await supabase
              .from("match_stats_raw")
              .select("player_id, damage")
              .eq("match_id", matchId)
              .order("damage", { ascending: false });

            if (ENABLE_SAMPLING && rawStats && rawStats.length > 0) {
              const excludeName = nickname.toLowerCase().trim();
              const samples = sampleParticipants(rawStats, excludeName);

              for (const sampleName of samples) {
                console.log(`       -> [샘플링] ${sampleName} 분석 요청 중...`);
                try {
                  await sleep(5000); // 샘플 참가자 분석 시 매치당 sleep 적용
                  await axios.get(`${MATCH_API_URL}?matchId=${matchId}&nickname=${encodeURIComponent(sampleName)}&platform=steam`);
                  console.log(`         ✅ 샘플링 완료`);
                } catch (apiErr: any) {
                  console.log(`         ℹ️ 스킵: ${apiErr.response?.data?.error || "처리 불가"}`);
                }
              }
            }
          }
        } catch (apiErr: any) {
          console.log(`     ℹ️ 스킵: ${apiErr.response?.data?.error || "처리 불가"}`);
        }
        
        // [최적화 3] DB 부하 분산을 위한 확실한 휴식 (매치당 5초)
        await sleep(5000);
      }
    }
  } catch (error: any) {
    console.error("🚨 중단:", error.message);
  }

  console.log("\n✨ 모든 작업이 완료되었습니다.");
}

scrapeEliteData();
