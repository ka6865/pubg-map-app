import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const nickname = searchParams.get("nickname");
  const platform = searchParams.get("platform") || "steam";

  if (!matchId || !nickname) {
    return NextResponse.json(
      { error: "matchId와 nickname 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

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

    // 내 데이터와 팀 라스터 찾기
    const myInfo = participants.find((p: any) => p.attributes.stats.name === nickname);
    if (!myInfo) throw new Error("플레이어 데이터를 찾을 수 없습니다.");

    const myRoster = rosters.find((r: any) =>
      r.relationships.participants.data.some((p: any) => p.id === myInfo.id)
    );

    // 팀원들의 participants ID 목록 확보
    let teamParticipantIds: string[] = [];
    if (myRoster) {
      teamParticipantIds = myRoster.relationships.participants.data.map((p: any) => p.id);
    } else {
      teamParticipantIds = [myInfo.id];
    }

    // Participants ID를 바탕으로 PUBG Account ID 추출 (텔레메트리는 accountId를 사용)
    const teamAccountIds = teamParticipantIds.map((pid) => {
      const pData = participants.find((p: any) => p.id === pid);
      return pData ? pData.attributes.stats.playerId : null;
    }).filter(Boolean);

    // 2. 텔레메트리 JSON 집중 파싱
    const telemetryRes = await fetch(telemetryUrl);
    if (!telemetryRes.ok) throw new Error("텔레메트리 JSON 파일 다운로드 실패");
    
    // 큰 용량의 JSON을 배열로 파싱
    const events = await telemetryRes.json();

    // 3. 아군(팀원) 정보와 관련된 핵심 이벤트만 필터링하여 경량화
    const parsedEvents = [];
    let matchStartTime = "";
    
    // [신규] 교전한 적군 식별 및 추적 범위 (첫 교전 30초 전 ~ 사망 시까지) 파악
    const enemyTracking = new Map<string, { firstContact: number, deathTime: number }>();
    const getTime = (t: string) => new Date(t).getTime();

    // 1차 스캔: 교전 상대 식별 및 사망 시점 파악
    for (const ev of events) {
      const typeStr = (ev._T || ev.Type || ev.event || "UNKNOWN").toString();
      const lowerType = typeStr.toLowerCase();
      
      // 1-1. 교전 발생 확인 (데미지/기절/킬)
      const isCombat = lowerType.includes("kill") || lowerType.includes("groggy") || lowerType.includes("takedamage") || lowerType.includes("knock");
      if (isCombat) {
        const victim = ev.victim;
        const attacker = ev.finisher || ev.attacker || ev.killer;
        if (victim && attacker) {
          const isVictimTeam = teamAccountIds.includes(victim.accountId);
          const isAttackerTeam = teamAccountIds.includes(attacker.accountId);

          if (isVictimTeam || isAttackerTeam) {
            const enemy = isVictimTeam ? attacker : victim;
            if (enemy && !teamAccountIds.includes(enemy.accountId)) {
              const contactTime = getTime(ev._D || ev.Timestamp || "");
              const current = enemyTracking.get(enemy.accountId) || { firstContact: contactTime, deathTime: 9999999999999 };
              current.firstContact = Math.min(current.firstContact, contactTime);
              enemyTracking.set(enemy.accountId, current);
            }
          }
        }
      }

      // 1-2. 적군 사망 시점 파악
      if (lowerType === "logplayerkill") {
        const victimAccountId = ev.victim?.accountId;
        if (victimAccountId && enemyTracking.has(victimAccountId)) {
          const deathTime = getTime(ev._D || ev.Timestamp || "");
          const current = enemyTracking.get(victimAccountId)!;
          current.deathTime = deathTime;
        }
      }
    }

    // 2차 스캔: 위치 및 주요 이벤트 추출
    for (const ev of events) {
      try {
        const typeStr = (ev._T || ev.Type || ev.event || "UNKNOWN").toString();
        const lowerType = typeStr.toLowerCase();
        
        if (typeStr === "LogMatchStart") {
          matchStartTime = ev._D || ev.Timestamp || "";
          continue;
        }

        const eventTimeStr = ev._D || ev.Timestamp || "";
        const eventTime = getTime(eventTimeStr);

        // 위치 이동 로그 (아군 전체 + 교전 적군 첫 조점 30초 전 ~ 사망 시까지)
        if (lowerType === "logplayerposition") {
          if (ev.character) {
            const accId = ev.character.accountId;
            const isTeam = teamAccountIds.includes(accId);
            const tracking = enemyTracking.get(accId);
            // 부활 시스템 대응: 첫 교전 이후에는 매치 끝까지(또는 마지막 데이터까지) 추적 유지
            const inTrackingRange = tracking && (eventTime >= tracking.firstContact - 30000);

            if (isTeam || inTrackingRange) {
              parsedEvents.push({
                type: isTeam ? "position" : "enemy_position",
                time: eventTimeStr,
                name: ev.character.name,
                x: (ev.character.location?.x ?? 0) / 100,
                y: (ev.character.location?.y ?? 0) / 100,
                z: (ev.character.location?.z ?? 0) / 100,
              });
            }
          }
          continue;
        }

        // 🔫 매치 전체의 킬/기절/부활 로그 수집
        const isKillEvent = lowerType.includes("kill") || lowerType.includes("death");
        const isGroggyEvent = lowerType.includes("makegroggy") || lowerType.includes("knock");
        const isReviveEvent = lowerType.includes("revive");

        if (isKillEvent || isGroggyEvent || isReviveEvent) {
          const attackerObj = ev.finisher || ev.attacker || ev.killer || ev.reviver || null;
          const isEnvKill = !attackerObj || attackerObj.accountId === ev.victim?.accountId;
          const attackerName = isEnvKill ? (isReviveEvent ? "자가부활" : "환경/자연사") : (attackerObj?.name || "알 수 없음");
          const victimName = ev.victim?.name || "알 수 없음";

          const isAttackerTeam = !isEnvKill && attackerObj && teamAccountIds.includes(attackerObj.accountId);
          const isVictimTeam = ev.victim && teamAccountIds.includes(ev.victim.accountId);

          // 🔫 킬/기절 시 발사 방향 역산 (부활은 제외)
          let vX = null, vY = null;
          if (!isReviveEvent) {
            vX = ev.attacker?.viewDir?.x ?? ev.attacker?.ViewDir?.x ?? ev.finisher?.viewDir?.x ?? ev.killer?.viewDir?.x;
            vY = ev.attacker?.viewDir?.y ?? ev.attacker?.ViewDir?.y ?? ev.finisher?.viewDir?.y ?? ev.killer?.viewDir?.y;
            
            if (vX == null || vY == null) {
              const dx = (ev.victim?.location?.x || 0) - (attackerObj?.location?.x || ev.attacker?.location?.x || 0);
              const dy = (ev.victim?.location?.y || 0) - (attackerObj?.location?.y || ev.attacker?.location?.y || 0);
              const mag = Math.sqrt(dx * dx + dy * dy);
              if (mag > 0) { vX = dx / mag; vY = dy / mag; }
            }
          }

          parsedEvents.push({
            type: isKillEvent ? "kill" : (isGroggyEvent ? "groggy" : "revive"),
            time: eventTimeStr,
            attacker: attackerName,
            victim: victimName,
            x: (attackerObj?.location?.x || ev.attacker?.location?.x || 0) / 100,
            y: (attackerObj?.location?.y || ev.attacker?.location?.y || 0) / 100,
            victimX: (ev.victim?.location?.x || ev.victim?.location?.X || 0) / 100,
            victimY: (ev.victim?.location?.y || ev.victim?.location?.Y || 0) / 100,
            vX: vX, // 빔 효과를 위해 방향 추가
            vY: vY,
            weapon: ev.damageCauserName || ev.damageReason || "",
            isTeamAttacker: !!isAttackerTeam,
            isTeamVictim: !!isVictimTeam,
          });
          continue;
        }

        // 🔫 아군 발사 로그 (방향 데이터 포함)
        if (lowerType === "logplayerattack") {
          if (ev.attacker && teamAccountIds.includes(ev.attacker.accountId)) {
            parsedEvents.push({
              type: "shot",
              time: eventTimeStr,
              name: ev.attacker.name,
              x: (ev.attacker.location?.x ?? 0) / 100,
              y: (ev.attacker.location?.y ?? 0) / 100,
              // 바라보는 방향 벡터 보강 (대문자 및 다중 경로 확인)
              vX: ev.attacker?.viewDir?.x ?? ev.attacker?.ViewDir?.x ?? ev.viewDir?.x ?? ev.common?.isAttacking?.viewDir?.x,
              vY: ev.attacker?.viewDir?.y ?? ev.attacker?.ViewDir?.y ?? ev.viewDir?.y ?? ev.common?.isAttacking?.viewDir?.y,
              weapon: ev.weapon?.itemId || ev.attackType || "",
            });
          }
          continue;
        }

        // 차량 탑승/하차 (아군)
        if (lowerType === "logvehicleride" || lowerType === "logvehicleleave") {
          if (ev.character && teamAccountIds.includes(ev.character.accountId)) {
            parsedEvents.push({
              type: lowerType.includes("ride") ? "ride" : "leave",
              time: eventTimeStr,
              name: ev.character.name,
              vehicle: ev.vehicle?.vehicleId,
              x: (ev.character.location?.x ?? 0) / 100,
              y: (ev.character.location?.y ?? 0) / 100,
            });
          }
        }

        // 🌟 블루칩 부활(생성) 대응: LogPlayerCreate
        if (lowerType === "logplayercreate" && ev.character) {
          parsedEvents.push({
            type: "create",
            time: eventTimeStr,
            name: ev.character.name,
            x: (ev.character.location?.x ?? 0) / 100,
            y: (ev.character.location?.y ?? 0) / 100,
          });
        }
      } catch { continue; }
    }

    // 3-B. 자기장 상태 로그 파싱
    const zoneEvents = [];
    for (const ev of events) {
      if (ev._T === "LogGameStatePeriodic" && ev.gameState) {
        const gs = ev.gameState;
        zoneEvents.push({
          time: ev._D,
          blueX: gs.poisonGasWarningPosition?.x != null ? gs.poisonGasWarningPosition.x / 100 : null,
          blueY: gs.poisonGasWarningPosition?.y != null ? gs.poisonGasWarningPosition.y / 100 : null,
          blueRadius: gs.poisonGasWarningRadius != null ? gs.poisonGasWarningRadius / 100 : null,
          whiteX: gs.safetyZonePosition?.x != null ? gs.safetyZonePosition.x / 100 : null,
          whiteY: gs.safetyZonePosition?.y != null ? gs.safetyZonePosition.y / 100 : null,
          whiteRadius: gs.safetyZoneRadius != null ? gs.safetyZoneRadius / 100 : null,
        });
      }
    }

    return NextResponse.json({
      matchId,
      startTime: matchStartTime,
      teammates: teamAccountIds,
      events: parsedEvents,
      zoneEvents,
    });

  } catch (error: any) {
    console.error("Telemetry Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
