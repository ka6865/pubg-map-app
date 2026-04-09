import { NextResponse } from "next/server";

// [AI-SUMMARY] 총기 코드명을 한글명으로 변환하는 매핑 테이블
const WEAPON_MAP: { [key: string]: string } = {
  "WeapAKM_C": "AKM", "WeapBerylM762_C": "베릴 M762", "WeapM416_C": "M416", "WeapSCAR-L_C": "SCAR-L",
  "WeapAUG_C": "AUG", "WeapG36C_C": "G36C", "WeapQBZ95_C": "QBZ", "WeapK2_C": "K2", "WeapAce32_C": "ACE32",
  "WeapM16A4_C": "M16A4", "WeapMk47Mutant_C": "뮤턴트", "WeapSKS_C": "SKS", "WeapSLR_C": "SLR",
  "WeapMk14_C": "Mk14", "WeapMini14_C": "미니14", "WeapQBU88_C": "QBU", "WeapVSS_C": "VSS",
  "WeapDragunov_C": "드라구노프", "WeapKar98k_C": "Kar98k", "WeapM24_C": "M24", "WeapAWM_C": "AWM",
  "WeapMosinNagant_C": "모신나강", "WeapWin1894_C": "윈체스터", "WeapLynxAMR_C": "링스 AMR",
  "WeapUZI_C": "마이크로 UZI", "WeapUMP45_C": "UMP45", "WeapVector_C": "벡터", "WeapTommyGun_C": "토미건",
  "WeapBizonPP19_C": "비존", "WeapMP5K_C": "MP5K", "WeapP90_C": "P90", "WeapJS9_C": "JS9",
  "WeapS12K_C": "S12K", "WeapS1897_C": "S1897", "WeapS686_C": "S686", "WeapDBS_C": "DBS",
  "WeapM249_C": "M249", "WeapDP28_C": "DP-28", "WeapMG3_C": "MG3", "WeapCrossbow_C": "석궁",
  "WeapPanzerfaust100_C": "판저파우스트", "WeapM79_C": "M79", "WeapGrenade_C": "수류탄",
  "WeapMolotov_C": "화염병", "Item_Weapon_FlashBang_C": "섬광탄", "Item_Weapon_C4_C": "C4"
};

const getWeaponName = (id: string) => WEAPON_MAP[id] || id.replace("Weap", "").replace("_C", "");

export async function POST(request: Request) {
  console.log("[AI-SUMMARY] 초정밀 분석 요청 시작 (Telemetry Mode)");
  try {
    const { matchIds, nickname, platform } = await request.json();
    
    if (!matchIds || matchIds.length === 0) {
      return NextResponse.json({ error: "매치 데이터가 없습니다." }, { status: 400 });
    }

    const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!groqApiKey) {
      return NextResponse.json({ error: "Groq API 키가 설정되지 않았습니다." }, { status: 500 });
    }

    const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" };

    // 1. 매치 상세 데이터 및 텔레메트리 로그 분석
    const targetMatchIds = matchIds.slice(0, 10);
    const detailedMatches: any[] = [];

    for (const [index, id] of targetMatchIds.entries()) {
      try {
        console.log(`[AI-SUMMARY] (${index + 1}/${targetMatchIds.length}) 매치 ${id} 분석 중...`);
        
        const res = await fetch(`https://api.pubg.com/shards/${platform}/matches/${id}`, { headers });
        if (!res.ok) continue;

        const data = await res.json();
        const participant = data.included?.find(
          (inc: any) => inc.type === "participant" && inc.attributes.stats.name === nickname
        );
        
        if (!participant) continue;

        // 플레이어의 고유 AccountId 추출 (이름보다 정확한 매칭을 위해)
        const accountId = participant.attributes.stats.playerId;

        // 텔레메트리 URL 추출 (이름 매칭 및 URL 패턴 매칭 병합)
        const telemetryAsset = data.included?.find(
          (inc: any) => inc.type === "asset" && (inc.attributes.name === "telemetry" || inc.attributes?.URL?.includes("telemetry"))
        );
        const telemetryUrl = telemetryAsset?.attributes?.URL;

        let killDetails: any[] = [];
        if (telemetryUrl) {
          try {
            console.log(`[AI-SUMMARY] 로그 로딩: ${telemetryUrl.slice(0, 60)}...`);
            const telRes = await fetch(telemetryUrl);
            
            if (telRes.ok) {
              const arrayBuffer = await telRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              
              let telDataStr = "";
              // GZIP 압축 여부 확인 및 해제 (node:zlib 사용)
              if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
                const zlib = await import("node:zlib");
                const decompressed = zlib.gunzipSync(buffer);
                telDataStr = decompressed.toString("utf-8");
              } else {
                telDataStr = buffer.toString("utf-8");
              }

              const telData = JSON.parse(telDataStr);
              const lowerNickname = nickname.toLowerCase();
              
              if (Array.isArray(telData)) {
                killDetails = telData
                  .filter((e: any) => {
                    const type = e._T;
                    if (type !== "LogPlayerKill" && type !== "LogPlayerMakeDBNO") return false;
                    const attacker = e.attacker || e.killer;
                    if (!attacker) return false;
                    return attacker.name?.toLowerCase() === lowerNickname || attacker.accountId === accountId;
                  })
                  .map((k: any) => ({
                    type: k._T === "LogPlayerKill" ? "킬" : "기절",
                    weapon: getWeaponName(k.damageCauserName || k.damageTypeCategory || "Unknown"),
                    distance: k.distance || 0,
                    reason: k.damageReason || "Normal",
                    victimName: k.victim?.name || "Unknown"
                  }));
                
                console.log(`[AI-SUMMARY] 매치 ${id}: 교전 ${killDetails.length}건 성공 (데이터량: ${telData.length})`);
              }
            }
          } catch (telErr) {
            console.error(`[AI-SUMMARY] 텔레메트리 처리 실패 (${id}):`, telErr);
          }
        }
        
        detailedMatches.push({
          mapName: {
            Erangel_Main: "에란겔", Baltic_Main: "에란겔", Desert_Main: "미라마",
            Tiger_Main: "태이고", Neon_Main: "론도", Savage_Main: "사녹", Summer_Main: "사녹",
            DihorOtok_Main: "비켄디", Chimera_Main: "데스턴", Kiki_Main: "데스턴",
          }[data.data.attributes.mapName as string] || data.data.attributes.mapName,
          gameMode: data.data.attributes.gameMode,
          stats: { ...participant.attributes.stats },
          killDetails, // 텔레메트리에서 추출한 상세 킬 정보
          createdAt: data.data.attributes.createdAt,
        });

        if (index < targetMatchIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (err: any) {
        console.error(`[AI-SUMMARY] 매치 ${id} 오류:`, err.message);
      }
    }

    if (detailedMatches.length === 0) {
      return NextResponse.json({ error: "상세 매치 정보를 가져올 수 없습니다." }, { status: 404 });
    }

    // 2. 데이터 요약
    const summary = {
      totalKills: detailedMatches.reduce((acc, m) => acc + m.stats.kills, 0),
      totalDamage: detailedMatches.reduce((acc, m) => acc + m.stats.damageDealt, 0),
      allKillDetails: detailedMatches.flatMap(m => m.killDetails),
      avgWinPlace: detailedMatches.reduce((acc, m) => acc + m.stats.winPlace, 0) / detailedMatches.length,
      deathTypes: detailedMatches.map(m => m.stats.deathType),
    };

    // 3. AI 프롬프트 생성 (총기 상세 분석 포함)
    const systemPrompt = `당신은 대한민국 최고의 배틀그라운드 프로팀 메인 코치입니다. 
최근 10경기의 매치 상세 데이터와 텔레메트리 로그(킬 상세 내역)를 바탕으로 초정밀 전략 분석 리포트를 작성하세요.

[분석 핵심 지침]
1. 정밀 총기 숙련도 분석 (Telemetry 기반):
   - 제공된 '상세 킬 내역(killDetails)'을 보고 어떤 총기를 주로 사용하여 킬을 냈는지 분석하세요.
   - 예: "베릴 M762를 주력으로 10m 이내 초근접 교전에서 승률이 매우 높습니다."
   - 예: "SR(M24, Kar98k)을 사용한 헤드샷 비중이 낮으므로 리드샷 연습이 필요합니다."
2. 교전 거리별 최적화 진단:
   - 각 킬의 '거리(distance)'를 분석하여 플레이어의 유효 교전 사거리를 정의하세요.
3. KDA 및 데스 원인 심층 진단:
   - deathType(자기장사, 전투사 등)을 통해 운영 능력을 평가하세요.
4. 상황별 맞춤 처방:
   - "장거리 교전 시 Mini14 선호도가 높으나 탄속 적응이 필요함" 등 실제 총기를 언급한 구체적인 코칭을 제공하세요.

[작성 형식]
- 반드시 100% 한국어로만 작성하세요. 
- 마크다운(##, 표, 굵게)을 사용하여 전문적인 리포트 형식을 유지하세요.`;

    const userPrompt = `플레이어: ${nickname}
최근 ${detailedMatches.length}경기 상세 매치 데이터 및 킬로그(Telemetry):
${JSON.stringify(detailedMatches, null, 2)}

[종합 요약 및 지표]
- 전체 전투 기록: 총 ${summary.totalKills}킬 / 평균 딜량 ${Math.floor(summary.totalDamage / detailedMatches.length)}
- 총기별 킬 상세 요약: ${JSON.stringify(summary.allKillDetails.reduce((acc: any, k: any) => {
      acc[k.weapon] = (acc[k.weapon] || 0) + 1;
      return acc;
    }, {}))}
- 데스 기록 리스트: ${summary.deathTypes.join(", ")}
- 최근 10경기 평균 순위: ${summary.avgWinPlace.toFixed(1)}위`;

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) throw new Error(`Groq API Error: ${aiResponse.status}`);
    const aiData = await aiResponse.json();
    return NextResponse.json({ analysis: aiData.choices[0]?.message?.content || "결과 생성 실패" });
  } catch (error: any) {
    console.error("[AI-SUMMARY] 치명적 에러:", error);
    return NextResponse.json({ error: error.message || "오류 발생" }, { status: 500 });
  }
}
