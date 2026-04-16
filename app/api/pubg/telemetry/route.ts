import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const nickname = searchParams.get("nickname");
  const mapName = searchParams.get("mapName") || "Erangel";
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

  const MAP_SIZES: Record<string, number> = {
    erangel: 816000, miramar: 816000, taego: 816000, deston: 816000, rondo: 816000, vikendi: 816000,
    sanhok: 408000, paramo: 306000, karakin: 204000, haven: 102000
  };
  const mapSize = MAP_SIZES[mapName.toLowerCase()] || 816000;
  const SIMPLIFY_THRESHOLD = 500;
  
  const scaleX = (x: number) => (x / mapSize) * 8192;
  const scaleY = (y: number) => 8192 - ((y / mapSize) * 8192);

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

    // Participants ID를 바탕으로 PUBG Account ID 추출
    const teamAccountIds = teamParticipantIds.map((pid: string) => {
      const pData = participants.find((p: any) => p.id === pid);
      return pData ? pData.attributes.stats.playerId : null;
    }).filter(Boolean);

    // 2. 텔레메트리 JSON 다운로드 및 파싱
    const telemetryRes = await fetch(telemetryUrl);
    if (!telemetryRes.ok) throw new Error("텔레메트리 JSON 파일 다운로드 실패");
    const events = await telemetryRes.json();

    const parsedEvents: any[] = [];
    let matchStartTimeRaw = "";
    
    // 적군 식별 추적
    const enemyTracking = new Map<string, { firstContact: number, deathTime: number }>();
    const getTime = (t: string) => new Date(t).getTime();

    // 1차 스캔: 교전 시간 추출
    for (const ev of events) {
      const typeStr = (ev._T || ev.Type || ev.event || "UNKNOWN").toString();
      const lowerType = typeStr.toLowerCase();
      
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

      if (lowerType === "logplayerkill") {
        const victimAccountId = ev.victim?.accountId;
        if (victimAccountId && enemyTracking.has(victimAccountId)) {
          const deathTime = getTime(ev._D || ev.Timestamp || "");
          const current = enemyTracking.get(victimAccountId)!;
          current.deathTime = deathTime;
        }
      }
      
      if (typeStr === "LogMatchStart" && !matchStartTimeRaw) {
        matchStartTimeRaw = ev._D || ev.Timestamp || "";
      }
    }
    
    // 2차 스캔 및 정리
    if (!matchStartTimeRaw && events.length > 0) {
       matchStartTimeRaw = events[0]._D || events[0].Timestamp;
    }
    const matchStartTime = getTime(matchStartTimeRaw) || 0;

    const lastPosByPlayer: Record<string, { x: number, y: number }> = {};
    const teamNamesSet = new Set<string>();

    for (const ev of events) {
      try {
        const typeStr = (ev._T || ev.Type || ev.event || "UNKNOWN").toString();
        const lowerType = typeStr.toLowerCase();
        if (typeStr === "LogMatchStart") continue;

        const eventTimeStr = ev._D || ev.Timestamp || "";
        const eventTime = getTime(eventTimeStr);
        const relativeTimeMs = eventTime - matchStartTime;

        if (lowerType === "logplayerposition") {
          if (ev.character) {
            const accId = ev.character.accountId;
            const isTeam = teamAccountIds.includes(accId);
            const tracking = enemyTracking.get(accId);
            const inTrackingRange = tracking && (eventTime >= tracking.firstContact - 30000);

            if (isTeam || inTrackingRange) {
              const name = ev.character.name;
              const rawX = ev.character.location?.x ?? 0;
              const rawY = ev.character.location?.y ?? 0;
              
              if (name) {
                if (isTeam) teamNamesSet.add(name);
                
                const last = lastPosByPlayer[name];
                if (last) {
                  const dx = rawX - last.x; 
                  const dy = rawY - last.y;
                  if (Math.sqrt(dx * dx + dy * dy) < SIMPLIFY_THRESHOLD && !inTrackingRange) {
                     continue; 
                  }
                }
                lastPosByPlayer[name] = { x: rawX, y: rawY };
              }

              parsedEvents.push({
                type: isTeam ? "position" : "enemy_position",
                time: eventTimeStr,
                relativeTimeMs,
                name: name,
                x: scaleX(rawX),
                y: scaleY(rawY),
                z: (ev.character.location?.z ?? 0) / 100,
              });
            }
          }
          continue;
        }

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
            relativeTimeMs,
            attacker: attackerName,
            victim: victimName,
            x: scaleX(attackerObj?.location?.x || ev.attacker?.location?.x || 0),
            y: scaleY(attackerObj?.location?.y || ev.attacker?.location?.y || 0),
            victimX: scaleX(ev.victim?.location?.x || ev.victim?.location?.X || 0),
            victimY: scaleY(ev.victim?.location?.y || ev.victim?.location?.Y || 0),
            vX: vX, 
            vY: vY,
            weapon: ev.damageCauserName || ev.damageReason || "",
            isTeamAttacker: !!isAttackerTeam,
            isTeamVictim: !!isVictimTeam,
          });
          continue;
        }

        if (lowerType === "logplayerattack") {
          if (ev.attacker && teamAccountIds.includes(ev.attacker.accountId)) {
            parsedEvents.push({
              type: "shot",
              time: eventTimeStr,
              relativeTimeMs,
              name: ev.attacker.name,
              x: scaleX(ev.attacker.location?.x ?? 0),
              y: scaleY(ev.attacker.location?.y ?? 0),
              vX: ev.attacker?.viewDir?.x ?? ev.attacker?.ViewDir?.x ?? ev.viewDir?.x ?? ev.common?.isAttacking?.viewDir?.x,
              vY: ev.attacker?.viewDir?.y ?? ev.attacker?.ViewDir?.y ?? ev.viewDir?.y ?? ev.common?.isAttacking?.viewDir?.y,
              weapon: ev.weapon?.itemId || ev.attackType || "",
            });
          }
          continue;
        }

        if (lowerType === "logvehicleride" || lowerType === "logvehicleleave") {
          if (ev.character && teamAccountIds.includes(ev.character.accountId)) {
            parsedEvents.push({
              type: lowerType.includes("ride") ? "ride" : "leave",
              time: eventTimeStr,
              relativeTimeMs,
              name: ev.character.name,
              vehicle: ev.vehicle?.vehicleId,
              x: scaleX(ev.character.location?.x ?? 0),
              y: scaleY(ev.character.location?.y ?? 0),
            });
          }
        }

        if (lowerType === "logplayercreate" && ev.character) {
          if (teamAccountIds.includes(ev.character.accountId)) {
            parsedEvents.push({
              type: "create",
              time: eventTimeStr,
              relativeTimeMs,
              name: ev.character.name,
              x: scaleX(ev.character.location?.x ?? 0),
              y: scaleY(ev.character.location?.y ?? 0),
            });
          }
        }
      } catch { continue; }
    }

    // 3. 자기장 데이터 파싱 및 예측 계산
    const zoneEvents: any[] = [];
    for (const ev of events) {
      if (ev._T === "LogGameStatePeriodic" && ev.gameState) {
        const gs = ev.gameState;
        const eTime = getTime(ev._D || ev.Timestamp || "");
        zoneEvents.push({
          time: ev._D,
          relativeTimeMs: eTime - matchStartTime,
          blueX: gs.poisonGasWarningPosition?.x != null ? scaleX(gs.poisonGasWarningPosition.x) : null,
          blueY: gs.poisonGasWarningPosition?.y != null ? scaleY(gs.poisonGasWarningPosition.y) : null,
          blueRadius: gs.poisonGasWarningRadius != null ? scaleX(gs.poisonGasWarningRadius) : null, 
          whiteX: gs.safetyZonePosition?.x != null ? scaleX(gs.safetyZonePosition.x) : null,
          whiteY: gs.safetyZonePosition?.y != null ? scaleY(gs.safetyZonePosition.y) : null,
          whiteRadius: gs.safetyZoneRadius != null ? scaleX(gs.safetyZoneRadius) : null,
        });
      }
    }

    for (let i = 0; i < zoneEvents.length; i++) {
      const cur = zoneEvents[i];
      const curBlue = cur.blueRadius ?? 0;
      const curWhite = cur.whiteRadius ?? 0;

      cur.isZoneMoving = curBlue > curWhite * 1.05;

      let nextPhaseMs: null | number = null;
      for (let j = i + 1; j < zoneEvents.length; j++) {
        const nxt = zoneEvents[j];
        if (nxt.whiteRadius == null || cur.whiteRadius == null) continue;
        const changePct = Math.abs(nxt.whiteRadius - cur.whiteRadius) / Math.max(cur.whiteRadius, 1);
        if (changePct > 0.08) {
          nextPhaseMs = nxt.relativeTimeMs;
          break;
        }
      }
      cur.nextPhaseRelativeMs = nextPhaseMs;
    }

    parsedEvents.sort((a, b) => a.relativeTimeMs - b.relativeTimeMs);

    return NextResponse.json({
      matchId,
      startTime: matchStartTimeRaw,
      teammates: teamAccountIds,
      teamNames: Array.from(teamNamesSet),
      events: parsedEvents,
      zoneEvents,
    });

  } catch (error: any) {
    console.error("Telemetry Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
