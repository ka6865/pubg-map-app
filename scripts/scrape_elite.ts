// scripts/scrape_elite.ts
import axios from 'axios';
import dotenv from 'dotenv';

// .env 및 .env.local 파일의 환경변수 로드
dotenv.config({ path: '.env.local' });
dotenv.config();

const PUBG_API_KEY = process.env.PUBG_API_KEY;
const BASE_URL = "https://api.pubg.com/shards/steam";
const LOCAL_API_URL = "http://localhost:3000/api/pubg/match"; // 현재 구동 중인 로컬 서버 활용

if (!PUBG_API_KEY) {
  console.error("🚨 PUBG_API_KEY가 .env 파일에 설정되어 있지 않습니다.");
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${PUBG_API_KEY}`,
  Accept: "application/vnd.api+json",
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeEliteData() {
  console.log("🚀 [BGMS Elite Scraper] 작업을 시작합니다...");

  try {
    // 1. 현재 시즌 ID 조회
    console.log("📡 현재 시즌 정보를 조회 중...");
    const seasonRes = await axios.get(`${BASE_URL}/seasons`, { headers: HEADERS });
    const currentSeason = seasonRes.data.data.find((s: any) => s.attributes.isCurrentSeason);
    
    if (!currentSeason) {
      console.error("현재 시즌을 찾을 수 없습니다. 응답 데이터를 확인하세요.");
      return;
    }
    
    // 2. 리더보드 상위 플레이어 조회 (아시아 서버 pc-as 기준)
    console.log("🏆 리더보드 플레이어를 스캔 중 (Source: pc-as)...");
    const leaderboardShard = "pc-as"; // 스팀 글로벌 대신 아시아 지역 샤드 사용
    const seasonId = currentSeason.id;
    console.log(`✅ 현재 시즌: ${seasonId}`);

    const gameModes = ["squad", "squad-fpp", "solo", "solo-fpp", "duo", "duo-fpp"]; 
    const playerPool = new Map<string, string>(); // accountId -> nickname (중복 방지)
    
    for (const mode of gameModes) {
      try {
        console.log(`   - [${mode}] 모드 시도 중...`);
        // 리더보드 조회는 지역 샤드(pc-as) 사용
        const leaderboardRes = await axios.get(`https://api.pubg.com/shards/${leaderboardShard}/leaderboards/${seasonId}/${mode}`, { headers: HEADERS });
        const modePlayers = leaderboardRes.data.included?.filter((i: any) => i.type === "player").slice(0, 20) || [];
        modePlayers.forEach((p: any) => playerPool.set(p.id, p.attributes.name));
        console.log(`     ✅ [${mode}]에서 ${modePlayers.length}명 확보 (현재 총 ${playerPool.size}명)`);
      } catch (err: any) {
        console.log(`   ⚠️ [${mode}] 조회 실패: ${err.response?.data?.errors?.[0]?.detail || err.message}`);
      }
    }

    if (playerPool.size === 0) {
      console.warn("⚠️ 모든 모드에서 리더보드 플레이어를 찾을 수 없습니다.");
      return;
    }
    
    console.log(`\n🎯 총 ${playerPool.size}명의 유니크 플레이어 풀을 구성했습니다. 분석을 시작합니다.`);

    // 3. 각 플레이어별 매치 분석
    for (const [accountId, nickname] of playerPool.entries()) {
      console.log(`\n🔍 [${nickname}] 데이터 수집 시작...`);

      // [V11.2] API 차단 방지를 위한 플레이어 간 간격 확보 (6초)
      await sleep(6000);

      let retryCount = 0;
      const maxRetries = 3;
      let matchIds: string[] = [];

      while (retryCount < maxRetries) {
        try {
          // 플레이어 상세 정보 (매치 리스트) 조회
          const pDetails = await axios.get(`${BASE_URL}/players/${accountId}`, { headers: HEADERS });
          matchIds = pDetails.data.data.relationships.matches.data.slice(0, 5).map((m: any) => m.id);
          break; // 성공 시 탈출
        } catch (pErr: any) {
          if (pErr.response?.status === 429) {
            console.log(`   ⚠️ API 호출 제한(429) 감지! 30초 후 재시도... (${retryCount + 1}/${maxRetries})`);
            await sleep(30000);
            retryCount++;
          } else {
            console.error(`   ⚠️ 플레이어(${nickname}) 매치 리스트 조회 중 오류 발생: ${pErr.message}`);
            break;
          }
        }
      }

      if (matchIds.length === 0) continue;

      for (const matchId of matchIds) {
        console.log(`   - 분석 중: MatchID(${matchId})`);
        
        // [핵 필터 및 정제] 우리 서버 API 호출 전 닉네임 정규화
        const cleanNickname = nickname.trim();
        
        // 우리 서버의 매치 분석 API 호출 (V11.1 규격 적용)
        try {
          const res = await axios.get(`${LOCAL_API_URL}?matchId=${matchId}&nickname=${encodeURIComponent(cleanNickname)}&platform=steam`);
          
          if (res.status === 200) {
            const data = res.data;
            if (data.stats.damageDealt > 1800 || data.stats.kills > 25) {
              console.log(`     🚫 핵 의심 데이터 감지 (딜량: ${Math.round(data.stats.damageDealt)}, 킬: ${data.stats.kills}). 스킵.`);
              continue;
            }
            const dPhase = data.deathPhase !== undefined ? `${data.deathPhase}Ph` : "N/A";
            console.log(`     ✅ 분석 완료: V${data.v} (딜량: ${Math.round(data.stats.damageDealt)}, 생존: ${dPhase})`);
          }
        } catch (apiErr: any) {
          if (apiErr.response?.status === 429) {
            console.log("     ⚠️ Local API Rate Limit 도달! 15초 대기...");
            await sleep(15000);
          } else {
            console.log(`     ℹ️ 스킵 (이유: ${apiErr.response?.data?.error || "처리 불가 매치"})`);
          }
        }
        
        // API 레이트 리밋 방지를 위한 쿨타임 (경쟁전은 텔레메트리가 커서 처리에 시간이 걸리므로 3초 대기)
        await sleep(3000);
      }
    }

    console.log("\n✨ [BGMS Elite Scraper] 모든 작업을 성공적으로 마쳤습니다!");
    console.log("📊 이제 global_benchmarks 테이블에 최신 상위권 데이터가 축적되었습니다.");

  } catch (error: any) {
    console.error("🚨 스크립트 중단:", error.message);
  }
}

scrapeEliteData();
