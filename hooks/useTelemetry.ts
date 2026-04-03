import { useState, useEffect, useRef } from "react";

export interface TelemetryEvent {
  type: "position" | "enemy_position" | "ride" | "leave" | "kill" | "groggy" | "took_damage" | "shot" | "revive" | "create";
  time: string;
  name?: string;
  x: number;
  y: number;
  z?: number;
  vX?: number; // 발사 방향 X
  vY?: number; // 발사 방향 Y
  vehicle?: string;
  attacker?: string;
  victim?: string;
  detail?: string;
  weapon?: string;    // 사용 무기 내부 코드
  distance?: number | null; // 킬 거리 (m)
  victimX?: number; // 🌟 피해자 사망 위치 X
  victimY?: number; // 🌟 피해자 사망 위치 Y
  isTeamAttacker?: boolean;
  isTeamVictim?: boolean;
  relativeTimeMs: number;  // 전처리 시 추가됨
}

export interface PlayerState {
  name: string;
  x: number;
  y: number;
  isDead: boolean;
  isGroggy: boolean;
  isInVehicle: boolean;
  isEnemy?: boolean;
  vehicleId?: string;
  lastUpdateMs?: number;
  lastDeathMs?: number;
  deathX?: number; // 🌟 사망 지점 X
  deathY?: number; // 🌟 사망 지점 Y
}

export function useTelemetry(matchId: string | null, nickname: string | null, mapName: string) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [teammates, setTeammates] = useState<string[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>([]); // 이름 기반의 안정적인 팀원 목록 (컬러 매핑용)
  const [zoneEvents, setZoneEvents] = useState<any[]>([]); // 🔵 자기장/안전구역 타임라인
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTimeMs, setCurrentTimeMs] = useState(0); // 매치 시작 후 경과 시간 (ms)
  const [maxTimeMs, setMaxTimeMs] = useState(0);

  // 텔레메트리 다운로드 및 전처리
  useEffect(() => {
    if (!matchId || !nickname) return;
    
    const fetchTelemetry = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/pubg/telemetry?matchId=${matchId}&nickname=${nickname}`);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch telemetry");
        }

        const sortedEvents = data.events.sort(
          (a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );

        if (sortedEvents.length > 0) {
          const startTime = new Date(data.startTime || sortedEvents[0].time).getTime();
          const endTime = new Date(sortedEvents[sortedEvents.length - 1].time).getTime();
          setMaxTimeMs(endTime - startTime);
          
          // 맵 크기에 따른 스케일링 (8x8 맵은 816000 cm 기준, 4x4는 408000 기준)
          const MAP_SIZES: Record<string, number> = {
            Erangel: 816000, Miramar: 816000, Taego: 816000, Deston: 816000, Rondo: 816000, Vikendi: 816000,
            Sanhok: 408000, Paramo: 306000, Karakin: 204000, Haven: 102000
          };
          const mapSize = MAP_SIZES[mapName] || 816000;

          // 인게임 좌표변환 (Leaflet은 (0,0)이 좌하단(Bottom-Left)이나, PUBG는 좌상단(Top-Left))
          // 따라서 y축을 반전시켜줍니다 (8192 - 변환된y)
          // 3. 아군(팀원) 정보와 관련된 핵심 이벤트만 필터링하여 경량화 및 좌표 단순화 (성능)
          const SIMPLIFY_THRESHOLD = 500; // 5m 이내의 움직임은 생략하여 성능 최적화
          const lastPosByPlayer: Record<string, { x: number, y: number }> = {};

          const processedEvents = sortedEvents.reduce((acc: any[], ev: any) => {
            const pname = ev.name || ev.victim || ev.attacker;
            const isPos = ev.type === "position" || ev.type === "enemy_position";
            
            if (isPos && pname) {
              const last = lastPosByPlayer[pname];
              const curX = typeof ev.x === "number" ? ev.x : 0;
              const curY = typeof ev.y === "number" ? ev.y : 0;
              
              if (last) {
                const dx = curX - last.x;
                const dy = curY - last.y;
                // 5m 미만의 미세 움직임은 아군 경로에서 제외하여 성능 최적화 (적군은 제외하지 않음)
                if (Math.sqrt(dx * dx + dy * dy) < SIMPLIFY_THRESHOLD && ev.type !== "enemy_position") {
                  return acc; 
                }
              }
              lastPosByPlayer[pname] = { x: curX, y: curY };
            }

            acc.push({
              ...ev,
              relativeTimeMs: new Date(ev.time).getTime() - startTime,
              x: typeof ev.x === "number" ? (ev.x / mapSize) * 8192 : ev.x,
              y: typeof ev.y === "number" ? 8192 - ((ev.y / mapSize) * 8192) : ev.y,
              victimX: typeof ev.victimX === "number" ? (ev.victimX / mapSize) * 8192 : ev.victimX,
              victimY: typeof ev.victimY === "number" ? 8192 - ((ev.victimY / mapSize) * 8192) : ev.victimY,
              vX: ev.vX,
              vY: ev.vY,
            });
            return acc;
          }, []);

          setEvents(processedEvents);
          setTeammates(data.teammates || []);
          
          // 각 플레이어별 고유 이름을 추출하여 배열로 저장 (항상 동일한 순서 유지)
          const extractedNames = Array.from(new Set(
            processedEvents.filter((e: any) => e.type === "position" && e.name).map((e: any) => e.name)
          ));
          setTeamNames(extractedNames as string[]);

          // 자기장/안전구역 이벤트 좌표 변환 후 저장
          if (data.zoneEvents?.length > 0) {
            const processedZones = data.zoneEvents.map((z: any) => ({
              ...z,
              relativeTimeMs: new Date(z.time).getTime() - startTime,
              blueX: typeof z.blueX === "number" ? (z.blueX / mapSize) * 8192 : null,
              blueY: typeof z.blueY === "number" ? 8192 - ((z.blueY / mapSize) * 8192) : null,
              blueRadius: typeof z.blueRadius === "number" ? (z.blueRadius / mapSize) * 8192 : null,
              whiteX: typeof z.whiteX === "number" ? (z.whiteX / mapSize) * 8192 : null,
              whiteY: typeof z.whiteY === "number" ? 8192 - ((z.whiteY / mapSize) * 8192) : null,
              whiteRadius: typeof z.whiteRadius === "number" ? (z.whiteRadius / mapSize) * 8192 : null,
            }));

            // 각 존 스냅샷마다 "다음 단계 시작 시각"과 "자기장 이동 중" 여부 계산
            for (let i = 0; i < processedZones.length; i++) {
              const cur = processedZones[i];
              const curBlue = cur.blueRadius ?? 0;
              const curWhite = cur.whiteRadius ?? 0;

              // 자기장이 이동 중인가? = 파란 원이 흰 원보다 5% 이상 큰 경우
              cur.isZoneMoving = curBlue > curWhite * 1.05;

              // 다음 단계: 흰 원 반지름이 크게 바뀌는 시점 (새 안전구역 공지)
              let nextPhaseMs: number | null = null;
              for (let j = i + 1; j < processedZones.length; j++) {
                const nxt = processedZones[j];
                if (nxt.whiteRadius == null || cur.whiteRadius == null) continue;
                const changePct = Math.abs(nxt.whiteRadius - cur.whiteRadius) / Math.max(cur.whiteRadius, 1);
                if (changePct > 0.08) { // 8% 이상 변화 = 새 단계
                  nextPhaseMs = nxt.relativeTimeMs;
                  break;
                }
              }
              cur.nextPhaseRelativeMs = nextPhaseMs;
            }

            setZoneEvents(processedZones);
          }
        } else {
          setEvents([]);
          setTeamNames([]);
          setZoneEvents([]);
        }

      } catch (err: any) {
        console.error("Telemetry fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTelemetry();
  }, [matchId, nickname, mapName]);

  // 플레이백 타이머 로직
  const lastUpdateRef = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      return;
    }

    lastUpdateRef.current = Date.now();

    const loop = () => {
      const now = Date.now();
      const deltaMs = now - lastUpdateRef.current;
      lastUpdateRef.current = now;

      setCurrentTimeMs((prev) => {
        const nextTime = Math.min(prev + deltaMs * playbackSpeed, maxTimeMs);
        if (nextTime >= maxTimeMs) setIsPlaying(false);
        return nextTime;
      });

      timerRef.current = requestAnimationFrame(loop);
    };

    timerRef.current = requestAnimationFrame(loop);

    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, maxTimeMs]);

  // 현재 시간(currentTimeMs)에 맞는 플레이어 상태 계산 (최적화 버전: O(ΔN) 증분 업데이트)
  const statesRef = useRef<Record<string, PlayerState>>({});
  const lastProcessedTimeRef = useRef<number>(-1);
  const lastEventIndexRef = useRef<number>(0);
  const prevPosRef = useRef<Record<string, { x: number, y: number, time: number }>>({});
  const nextPosRef = useRef<Record<string, { x: number, y: number, time: number } | null>>({});

  useEffect(() => {
    if (events.length === 0) return;

    // 1. 타임라인 점프(Scrubbing) 또는 뒤로 가기 감지 시 상태 초기화
    const isJump = Math.abs(currentTimeMs - lastProcessedTimeRef.current) > 2000 || currentTimeMs < lastProcessedTimeRef.current;
    
    if (isJump) {
      statesRef.current = {};
      lastEventIndexRef.current = 0;
      prevPosRef.current = {};
      nextPosRef.current = {};
    }

    // 2. 증분 업데이트 (마지막 인덱스부터 현재 시간까지만 스캔)
    const states = statesRef.current;
    const evs = events as TelemetryEvent[];
    let i = lastEventIndexRef.current;

    while (i < evs.length && evs[i].relativeTimeMs <= currentTimeMs) {
      const ev = evs[i];
      const pname = ev.name || ev.victim || ev.attacker;
      
      if (pname) {
        if (!states[pname]) {
          states[pname] = { 
            name: pname, x: 0, y: 0, isDead: false, isGroggy: false, isInVehicle: false, 
            isEnemy: ev.type === "enemy_position" || (ev.isTeamVictim === false) || (ev.isTeamAttacker === false)
          };
        }

        // 상태 업데이트 로직 (기존과 동일하지만 증분 처리)
        if (ev.type === "position" || ev.type === "enemy_position") {
          states[pname].x = ev.x;
          states[pname].y = ev.y;
          states[pname].lastUpdateMs = ev.relativeTimeMs;
          
          const lastDeath = states[pname].lastDeathMs || 0;
          const { deathX, deathY } = states[pname];
          if (lastDeath > 0 && deathX && deathY && deathX !== 0 && deathY !== 0) {
            const dx = ev.x - deathX;
            const dy = ev.y - deathY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (ev.relativeTimeMs > lastDeath + 5000 && dist > 50) {
              states[pname].isDead = false;
            }
          } else if (lastDeath > 0) {
            // (create/revive 이벤트로만 해제됨)
          } else {
            states[pname].isDead = false;
          }
          
          if (ev.type === "enemy_position") states[pname].isEnemy = true;
          prevPosRef.current[pname] = { x: ev.x, y: ev.y, time: ev.relativeTimeMs };
          nextPosRef.current[pname] = null; // 위치가 바뀌었으니 다음 위치(Interpolation용) 초기화
        } else if (ev.type === "ride") {
          states[pname].isInVehicle = true;
          states[pname].vehicleId = ev.vehicle;
        } else if (ev.type === "leave") {
          states[pname].isInVehicle = false;
          states[pname].vehicleId = undefined;
        } else if (ev.type === "kill" && ev.victim === pname) {
          states[pname].isDead = true;
          states[pname].isGroggy = false;
          states[pname].lastDeathMs = ev.relativeTimeMs;
          states[pname].deathX = ev.victimX || states[pname].x || 0;
          states[pname].deathY = ev.victimY || states[pname].y || 0;
        } else if (ev.type === "groggy" && ev.victim === pname) {
          states[pname].isGroggy = true;
          states[pname].isDead = false;
          if (ev.isTeamVictim === false) states[pname].isEnemy = true;
        } else if ((ev.type === "revive" || ev.type === "create") && (ev.victim === pname || ev.name === pname)) {
          states[pname].isGroggy = false;
          states[pname].isDead = false;
          if (ev.isTeamVictim === false) states[pname].isEnemy = true;
        }
      }
      i++;
    }

    lastEventIndexRef.current = i;
    lastProcessedTimeRef.current = currentTimeMs;

    // 3. 보간(Interpolation)을 위한 미래 좌표 탐색 전처리 (필요한 플레이어만 스캔)
    for (const pname in states) {
      if (states[pname].isDead) continue;
      
      // 적군 제거 로직 (기존과 동일)
      if (states[pname].isEnemy && states[pname].lastUpdateMs && currentTimeMs - states[pname].lastUpdateMs > 15000) {
        delete states[pname];
        continue;
      }

      // 다음 위치가 아직 없거나 과거의 것이라면 새로 찾음
      if (!nextPosRef.current[pname]) {
        for (let j = i; j < evs.length; j++) {
          const nextEv = evs[j];
          const npname = nextEv.name || nextEv.victim || nextEv.attacker;
          if (npname === pname && (nextEv.type === "position" || nextEv.type === "enemy_position")) {
            nextPosRef.current[pname] = { x: nextEv.x, y: nextEv.y, time: nextEv.relativeTimeMs };
            break;
          }
        }
      }

      // 최종 보간 수행
      const p = prevPosRef.current[pname];
      const n = nextPosRef.current[pname];
      if (p && n && p.time < n.time && p.time <= currentTimeMs && n.time > currentTimeMs) {
        const ratio = (currentTimeMs - p.time) / (n.time - p.time);
        states[pname].x = p.x + (n.x - p.x) * ratio;
        states[pname].y = p.y + (n.y - p.y) * ratio;
      }
    }
  }, [currentTimeMs, events]);

  return {
    events,
    teammates,
    teamNames,
    zoneEvents, // 🔵 추가
    loading,
    error,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    currentTimeMs,
    setCurrentTimeMs,
    maxTimeMs,
    currentStates: statesRef.current,
  };
}
