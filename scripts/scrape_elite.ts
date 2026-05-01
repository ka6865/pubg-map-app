// scripts/scrape_elite.ts
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeEliteData() {
  console.log("🚀 [BGMS Smart Scraper] 작업을 시작합니다...");

  try {
    const seasonRes = await axios.get(`${BASE_URL}/seasons`, { headers: HEADERS });
    const currentSeason = seasonRes.data.data.find((s: any) => s.attributes.isCurrentSeason);
    if (!currentSeason) return;
    
    const seasonId = currentSeason.id;
    console.log(`✅ 현재 시즌: ${seasonId}`);

    const gameModes = ["squad", "squad-fpp", "solo", "solo-fpp"]; 
    const playerPool = new Map<string, string>();
    
    for (const mode of gameModes) {
      try {
        const leaderboardRes = await axios.get(`https://api.pubg.com/shards/pc-as/leaderboards/${seasonId}/${mode}`, { headers: HEADERS });
        const modePlayers = leaderboardRes.data.included?.filter((i: any) => i.type === "player").slice(0, 15) || [];
        modePlayers.forEach((p: any) => playerPool.set(p.id, p.attributes.name));
      } catch (err) {}
    }

    console.log(`🎯 총 ${playerPool.size}명의 타겟 플레이어 확보.`);

    for (const [accountId, nickname] of playerPool.entries()) {
      console.log(`\n🔍 [${nickname}] 매치 스캔 중...`);
      await sleep(3000); // 플레이어 간 간격

      let matchIds: string[] = [];
      try {
        const pDetails = await axios.get(`${BASE_URL}/players/${accountId}`, { headers: HEADERS });
        matchIds = pDetails.data.data.relationships.matches.data.slice(0, 5).map((m: any) => m.id);
      } catch (err) { continue; }

      for (const matchId of matchIds) {
        // 🌟 [최적화 1] DB 중복 체크 (이미 있으면 스킵)
        const { data: existing } = await supabase
          .from("processed_match_telemetry")
          .select("match_id")
          .eq("match_id", matchId)
          .eq("player_id", nickname.toLowerCase().trim())
          .single();

        if (existing) {
          console.log(`   - MatchID(${matchId}): 이미 존재함 (Skip)`);
          continue;
        }

        console.log(`   - MatchID(${matchId}): 신규 수집 시작...`);
        
        try {
          // [최적화 2] 로컬 서버 API 호출 (동기적으로 대기)
          const res = await axios.get(`${MATCH_API_URL}?matchId=${matchId}&nickname=${encodeURIComponent(nickname.trim())}&platform=steam`);
          
          if (res.status === 200) {
            const d = res.data;
            console.log(`     ✅ 성공: (딜량: ${Math.round(d.stats.damageDealt)}, 생존: ${d.deathPhase}Ph)`);
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
}

scrapeEliteData();
