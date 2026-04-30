import { NextResponse } from "next/server";

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

  const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/vnd.api+json",
  };

  const MAP_SIZES: Record<string, number> = {
    erangel: 819200, miramar: 819200, taego: 819200, deston: 819200, rondo: 819200, vikendi: 819200,
    sanhok: 409600, paramo: 307200, karakin: 204800, haven: 102400
  };
  const mapSize = MAP_SIZES[mapName.toLowerCase()] || 819200;
  const xOffset = mapName.toLowerCase() === "miramar" ? 1800 : 0;
  const yOffset = mapName.toLowerCase() === "miramar" ? 1200 : 0;
  const SIMPLIFY_THRESHOLD = 500;
  
  const scaleX = (x: number) => (x / mapSize) * 8192;
  const scaleY = (y: number) => (y / mapSize) * 8192;

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

    const accountIdToName = new Map<string, string>();
    participants.forEach((p: any) => {
      const accId = p.attributes.stats.playerId;
      const name = p.attributes.stats.name;
      if (accId && name) accountIdToName.set(accId, name);
    });

    // 2. 텔레메트리 JSON 다운로드 및 파싱 (캐시 무효화)
    const telemetryRes = await fetch(telemetryUrl, { cache: "no-store" });
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
    
    if (!matchStartTimeRaw && events.length > 0) {
       matchStartTimeRaw = events[0]._D || events[0].Timestamp;
    }
    const matchStartTime = getTime(matchStartTimeRaw) || 0;

    const lastPosByPlayer: Record<string, { x: number, y: number }> = {};
    const lastRotByPlayer: Record<string, number> = {}; 
    const groggyMap = new Map<string, { attackerAccountId: string, attackerName: string }>(); 
    const teamNames = teamAccountIds.map(aid => accountIdToName.get(aid)).filter(Boolean) as string[];

    // 🎯 팩트: 매치에 실제 폭발 로그가 있는지 확인 (중복 방지용)
    const hasRealExplosions = events.some((ev: any) => (ev._T || ev.Type || "").toLowerCase() === "logexplosiveexplode");

    for (const ev of events) {
      try {
        const typeStr = (ev._T || ev.Type || ev.event || "UNKNOWN").toString();
        const lowerType = typeStr.toLowerCase();
        const eventTimeStr = ev._D || ev.Timestamp || "";
        const eventTime = new Date(eventTimeStr).getTime();
        const relativeTimeMs = eventTime - matchStartTime;

        if (lowerType === "logplayermakegroggy") {
          const victimId = ev.victim?.accountId;
          const attackerId = ev.attacker?.accountId;
          if (victimId && attackerId) {
            groggyMap.set(victimId, { attackerAccountId: attackerId, attackerName: ev.attacker?.name || "" });
          }
        }

        if (typeStr === "LogMatchStart") continue;

        if (lowerType === "logplayerposition") {
          const char = ev.character || ev.attacker || ev.victim;
          if (char && char.name) {
            lastPosByPlayer[char.name] = { x: char.location?.x ?? 0, y: char.location?.y ?? 0 };
            lastRotByPlayer[char.name] = char.rotation || 0;

            parsedEvents.push({
              type: "position",
              time: eventTimeStr,
              relativeTimeMs,
              name: char.name,
              teamId: char.teamId,
              isTeam: teamAccountIds.includes(char.accountId),
              x: scaleX(char.location?.x ?? 0),
              y: scaleY(char.location?.y ?? 0),
              z: (char.location?.z ?? 0) / 100,
              health: char.health || 100,
            });
          }
          continue;
        }

        const isKillEvent = lowerType.includes("kill") || lowerType.includes("death");
        const isGroggyEvent = lowerType.includes("makegroggy") || lowerType.includes("knock");
        const isReviveEvent = lowerType.includes("revive");

        if (isKillEvent || isGroggyEvent || isReviveEvent) {
          const attackerObj = ev.finisher || ev.attacker || ev.killer || ev.reviver || null;
          const victimObj = ev.victim;
          const isEnvKill = !attackerObj || attackerObj.accountId === victimObj?.accountId;
          const attackerName = isEnvKill ? (isReviveEvent ? "자가부활" : "환경/자연사") : (attackerObj?.name || "알 수 없음");
          const victimName = victimObj?.name || "알 수 없음";

          const isAttackerTeam = !isEnvKill && attackerObj && teamAccountIds.includes(attackerObj.accountId);
          const isVictimTeam = victimObj && teamAccountIds.includes(victimObj.accountId);

          const assistants = ev.assistantAccountIds ? ev.assistantAccountIds.map((aid: string) => ({
            accountId: aid,
            name: accountIdToName.get(aid) || "Unknown"
          })) : [];

          if (isKillEvent && victimObj?.accountId) {
            const groggyInfo = groggyMap.get(victimObj.accountId);
            if (groggyInfo && groggyInfo.attackerAccountId !== attackerObj?.accountId) {
              if (!assistants.some((a: any) => a.accountId === groggyInfo.attackerAccountId)) {
                assistants.push({
                  accountId: groggyInfo.attackerAccountId,
                  name: groggyInfo.attackerName
                });
              }
            }
          }

          let vX = null, vY = null;
          if (!isReviveEvent) {
            vX = ev.attacker?.viewDir?.x ?? ev.attacker?.ViewDir?.x ?? ev.finisher?.viewDir?.x ?? ev.killer?.viewDir?.x ?? ev.maker?.viewDir?.x ?? ev.dBNOMaker?.viewDir?.x;
            vY = ev.attacker?.viewDir?.y ?? ev.attacker?.ViewDir?.y ?? ev.finisher?.viewDir?.y ?? ev.killer?.viewDir?.y ?? ev.maker?.viewDir?.y ?? ev.dBNOMaker?.viewDir?.y;
            if (vX == null || vY == null) {
              const dx = (victimObj?.location?.x || 0) - (attackerObj?.location?.x || ev.attacker?.location?.x || 0);
              const dy = (victimObj?.location?.y || 0) - (attackerObj?.location?.y || ev.attacker?.location?.y || 0);
              const mag = Math.sqrt(dx * dx + dy * dy);
              if (mag > 0) { vX = dx / mag; vY = dy / mag; }
            }
          }

          const charLoc = victimObj?.location || victimObj?.Location || attackerObj?.location || ev.attacker?.location || { x: 0, y: 0 };
          const isSystemName = ["환경/자연사", "알 수 없음", "자가부활", "자연사"].includes(attackerName) || ["환경/자연사", "알 수 없음"].includes(victimName);
          
          parsedEvents.push({
            type: isKillEvent ? "kill" : (isGroggyEvent ? "groggy" : "revive"),
            time: eventTimeStr,
            relativeTimeMs,
            attacker: attackerName,
            attackerAccountId: attackerObj?.accountId,
            victim: victimName,
            victimAccountId: victimObj?.accountId,
            teamId: isAttackerTeam ? (attackerObj?.teamId ?? 999) : (victimObj?.teamId ?? 999),
            x: scaleX(charLoc.x),
            y: scaleY(charLoc.y),
            victimX: scaleX(victimObj?.location?.x || 0),
            victimY: scaleY(victimObj?.location?.y || 0),
            vX: vX, 
            vY: vY,
            weapon: ev.damageCauserName || ev.damageReason || "",
            isTeamAttacker: !!isAttackerTeam,
            isTeamVictim: !!isVictimTeam,
            isSystem: isSystemName,
            assistants: assistants,
          });
          continue;
        }

        if (lowerType === "logplayerattack") {
          const attacker = ev.attacker;
          if (attacker) {
            const weapon = (ev.weapon?.itemId || ev.attackType || "").toLowerCase();
            const isThrowable = weapon.includes("throw") || weapon.includes("smoke") || weapon.includes("grenade") || weapon.includes("m79") || weapon.includes("launcher");
            
            parsedEvents.push({
              type: isThrowable ? "throw" : "shot",
              time: eventTimeStr,
              relativeTimeMs,
              name: attacker.name,
              accountId: attacker.accountId,
              teamId: attacker.teamId,
              isTeam: teamAccountIds.includes(attacker.accountId),
              x: scaleX(attacker.location?.x ?? 0),
              y: scaleY(attacker.location?.y ?? 0),
              rotation: attacker.rotation || lastRotByPlayer[attacker.name] || 0,
              vX: isThrowable ? null : (attacker?.viewDir?.x ?? ev.viewDir?.x),
              vY: isThrowable ? null : (attacker?.viewDir?.y ?? ev.viewDir?.y),
              weapon: ev.weapon?.itemId || ev.attackType || "",
            });
          }
          continue;
        }

        if (lowerType === "logplayertakedamage" && ev.attacker && ev.victim) {
          parsedEvents.push({
            type: "damage",
            time: eventTimeStr,
            relativeTimeMs,
            attackerName: ev.attacker.name,
            attackerAccountId: ev.attacker.accountId,
            victimName: ev.victim.name,
            victimAccountId: ev.victim.accountId,
            damage: ev.damage,
            x: scaleX(ev.victim.location?.x ?? 0),
            y: scaleY(ev.victim.location?.y ?? 0),
          });
          continue;
        }

        if (lowerType === "logvehicleride" || lowerType === "logvehicleleave") {
          const char = ev.character || ev.attacker;
          if (char) {
            parsedEvents.push({
              type: lowerType.includes("ride") ? "ride" : "leave",
              time: eventTimeStr,
              relativeTimeMs,
              name: char.name,
              accountId: char.accountId,
              teamId: char.teamId,
              isTeam: teamAccountIds.includes(char.accountId),
              vehicle: ev.vehicle?.vehicleId,
              x: scaleX(char.location?.x ?? 0),
              y: scaleY(char.location?.y ?? 0),
            });
          }
          continue;
        }

        if (lowerType === "logplayerusethrowable") {
          // 🎯 공식 문서: 던진 주체는 character 또는 attacker 필드에 존재함
          const char = ev.character || ev.attacker;
          if (char) {
            const itemId = (
              ev.item?.itemId || 
              ev.weapon?.itemId || 
              ev.character?.executableItem?.itemId || 
              ""
            ).toLowerCase();
            
            // 🎯 팩트: 터미널 로그에서 확인된 긴급엄폐 수류탄 아이디(CoverStructDropHandFlare) 추가
            const throwableKeywords = ["smokebomb", "grenade", "flashbang", "molotov", "bluezone", "deployable", "shield", "coverstruct", "decoy", "c4"];
            
            if (throwableKeywords.some(k => itemId.includes(k))) {
              const rotDegree = char.rotation || lastRotByPlayer[char.name] || 0;
              const rot = rotDegree * (Math.PI / 180);
              
              if (!hasRealExplosions) {
                const estX = (char.location?.x ?? 0) + Math.sin(rot) * 2000;
                const estY = (char.location?.y ?? 0) - Math.cos(rot) * 2000;

                let vfxType = "grenade";
                if (itemId.includes("smokebomb") || itemId.includes("smoke")) vfxType = "smoke";
                else if (itemId.includes("flashbang")) vfxType = "flash";
                else if (itemId.includes("molotov")) vfxType = "molotov";
                else if (itemId.includes("bluezone")) vfxType = "bluezone";
                else if (itemId.includes("deployable") || itemId.includes("shield") || itemId.includes("coverstruct")) vfxType = "shield";

                parsedEvents.push({
                  type: vfxType,
                  time: eventTimeStr,
                  relativeTimeMs: relativeTimeMs + 2500, 
                  name: char.name,
                  weapon: itemId,
                  x: scaleX(estX),
                  y: scaleY(estY),
                  isEstimated: true
                });
              }
              
              parsedEvents.push({
                type: "throw",
                time: eventTimeStr,
                relativeTimeMs,
                name: char.name,
                weapon: itemId,
                x: scaleX(char.location?.x ?? 0),
                y: scaleY(char.location?.y ?? 0),
              });
            }
          }
          continue;
        }

        if (lowerType === "logexplosiveexplode") {
          // 🎯 공식 문서: 폭발 위치는 location 필드, 주체는 character 또는 attacker임
          const loc = ev.location || ev.character?.location || ev.attacker?.location;
          if (loc) {
            const explosiveId = (
              ev.explosiveItem?.itemId || 
              ev.explosiveId || 
              ev.item?.itemId ||
              ""
            ).toLowerCase();
            
            let vfxType = "grenade";
            if (explosiveId.includes("smokebomb") || explosiveId.includes("smoke")) vfxType = "smoke";
            else if (explosiveId.includes("flashbang")) vfxType = "flash";
            else if (explosiveId.includes("molotov")) vfxType = "molotov";
            else if (explosiveId.includes("bluezone")) vfxType = "bluezone";
            else if (explosiveId.includes("deployable") || explosiveId.includes("shield") || explosiveId.includes("coverstruct")) vfxType = "shield";

            parsedEvents.push({
              type: vfxType,
              time: eventTimeStr,
              relativeTimeMs,
              name: ev.character?.name || ev.attacker?.name || "",
              weapon: explosiveId,
              x: scaleX(loc.x),
              y: scaleY(loc.y),
              isRealExplosion: true
            });
            continue;
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
      } catch (err) {
        continue;
      }
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
          // 🎯 팩트: safetyZone은 현재 자기장(Blue Zone), poisonGasWarning은 다음 안전구역(White Zone)
          blueX: gs.safetyZonePosition?.x != null ? scaleX(gs.safetyZonePosition.x) : null,
          blueY: gs.safetyZonePosition?.y != null ? scaleY(gs.safetyZonePosition.y) : null,
          blueRadius: gs.safetyZoneRadius != null ? scaleX(gs.safetyZoneRadius) : null, 
          whiteX: gs.poisonGasWarningPosition?.x != null ? scaleX(gs.poisonGasWarningPosition.x) : null,
          whiteY: gs.poisonGasWarningPosition?.y != null ? scaleY(gs.poisonGasWarningPosition.y) : null,
          whiteRadius: gs.poisonGasWarningRadius != null ? scaleX(gs.poisonGasWarningRadius) : null,
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
      teamNames: teamNames,
      events: parsedEvents,
      zoneEvents,
    }, {
      headers: { "Cache-Control": "no-store" }
    });

  } catch (error: any) {
    console.error("Telemetry Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
