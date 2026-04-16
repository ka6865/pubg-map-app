import { useState, useEffect, useRef } from "react";
import getApiUrl from "../lib/api-config";

export interface TelemetryEvent {
  type: "position" | "enemy_position" | "ride" | "leave" | "kill" | "groggy" | "took_damage" | "shot" | "revive" | "create";
  time: string;
  name?: string;
  x: number;
  y: number;
  z?: number;
  vX?: number; 
  vY?: number; 
  vehicle?: string;
  attacker?: string;
  victim?: string;
  detail?: string;
  weapon?: string;    
  distance?: number | null; 
  victimX?: number; 
  victimY?: number; 
  isTeamAttacker?: boolean;
  isTeamVictim?: boolean;
  relativeTimeMs: number;  
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
  deathX?: number; 
  deathY?: number; 
}

export function useTelemetry(matchId: string | null, nickname: string | null, mapName: string) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [teammates, setTeammates] = useState<string[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>([]); 
  const [zoneEvents, setZoneEvents] = useState<any[]>([]); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTimeMs, setCurrentTimeMs] = useState(0); 
  const [maxTimeMs, setMaxTimeMs] = useState(0);

  useEffect(() => {
    if (!matchId || !nickname || !mapName) return;
    
    const fetchTelemetry = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiUrl = getApiUrl(`/api/pubg/telemetry?matchId=${matchId}&nickname=${nickname}&mapName=${mapName}`);
        const res = await fetch(apiUrl);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch telemetry");
        }

        const evs = data.events || [];
        setEvents(evs);
        setTeammates(data.teammates || []);
        setTeamNames(data.teamNames || []);
        setZoneEvents(data.zoneEvents || []);

        if (evs.length > 0) {
          const lastEvent = evs[evs.length - 1];
          setMaxTimeMs(lastEvent.relativeTimeMs || 0);
        } else {
          setMaxTimeMs(0);
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

  const statesRef = useRef<Record<string, PlayerState>>({});
  const lastProcessedTimeRef = useRef<number>(-1);
  const lastEventIndexRef = useRef<number>(0);
  const prevPosRef = useRef<Record<string, { x: number, y: number, time: number }>>({});
  const nextPosRef = useRef<Record<string, { x: number, y: number, time: number } | null>>({});

  useEffect(() => {
    if (events.length === 0) return;

    const isJump = Math.abs(currentTimeMs - lastProcessedTimeRef.current) > 2000 || currentTimeMs < lastProcessedTimeRef.current;
    
    if (isJump) {
      statesRef.current = {};
      lastEventIndexRef.current = 0;
      prevPosRef.current = {};
      nextPosRef.current = {};
    }

    const states = statesRef.current;
    const evs = events as TelemetryEvent[];
    let i = lastEventIndexRef.current;

    while (i < evs.length && evs[i].relativeTimeMs <= currentTimeMs) {
      const ev = evs[i];
      const rawName = ev.name || ev.victim || ev.attacker;
      if (!rawName) {
        i++;
        continue;
      }
      
      const pname = rawName.trim().toLowerCase();
      const originalName = rawName; // UI 표시용 원본 닉네임
      
      if (pname) {
        if (!states[pname]) {
          // 중요: 위치 정보 없는 일반 글로벌 교전/킬 로그만으로 고스트 마커가 생성되는 것 방지
          if (ev.type !== "position" && ev.type !== "enemy_position" && ev.type !== "create") {
            i++;
            continue;
          }

          let initX = typeof ev.x === "number" ? ev.x : -9999;
          let initY = typeof ev.y === "number" ? ev.y : -9999;
          
          if (pname === (ev.victim || "").trim().toLowerCase()) {
            initX = typeof ev.victimX === "number" ? ev.victimX : initX;
            initY = typeof ev.victimY === "number" ? ev.victimY : initY;
          }

          states[pname] = { 
            name: originalName, 
            x: initX, 
            y: initY, 
            isDead: false, 
            isGroggy: false, 
            isInVehicle: false, 
            isEnemy: !teamNames.map(t => t.trim().toLowerCase()).includes(pname)
          };
        }

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
            // keep dead
          } else {
            states[pname].isDead = false;
          }
          
          prevPosRef.current[pname] = { x: ev.x, y: ev.y, time: ev.relativeTimeMs };
          nextPosRef.current[pname] = null; 
        } else if (ev.type === "ride") {
          states[pname].isInVehicle = true;
          states[pname].vehicleId = ev.vehicle;
        } else if (ev.type === "leave") {
          states[pname].isInVehicle = false;
          states[pname].vehicleId = undefined;
        } else if (ev.type === "kill" && (ev.victim || "").trim().toLowerCase() === pname) {
          states[pname].isDead = true;
          states[pname].isGroggy = false;
          states[pname].lastDeathMs = ev.relativeTimeMs;
          states[pname].deathX = ev.victimX || states[pname].x || 0;
          states[pname].deathY = ev.victimY || states[pname].y || 0;
        } else if (ev.type === "groggy" && (ev.victim || "").trim().toLowerCase() === pname) {
          states[pname].isGroggy = true;
          states[pname].isDead = false;
        } else if ((ev.type === "revive" || ev.type === "create") && ((ev.victim || "").trim().toLowerCase() === pname || (ev.name || "").trim().toLowerCase() === pname)) {
          states[pname].isGroggy = false;
          states[pname].isDead = false;
        }
      }
      i++;
    }

    lastEventIndexRef.current = i;
    lastProcessedTimeRef.current = currentTimeMs;

    for (const pname in states) {
      if (states[pname].isDead) {
        // 적군의 해골 마커는 사망 후 30초가 지나면 맵에서 제거
        if (states[pname].isEnemy && states[pname].lastDeathMs && currentTimeMs - states[pname].lastDeathMs > 30000) {
          delete states[pname];
        }
        continue;
      }
      
      if (states[pname].isEnemy && states[pname].lastUpdateMs && currentTimeMs - states[pname].lastUpdateMs > 15000) {
        delete states[pname];
        continue;
      }

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

      const p = prevPosRef.current[pname];
      const n = nextPosRef.current[pname];
      // 이전 위치가 -9999(초기화 상태)라면 화면 밖에서부터 보간하며 날아오는 현상을 방지
      if (p && n && p.time < n.time && p.time <= currentTimeMs && n.time > currentTimeMs) {
        if (p.x === -9999 || p.y === -9999) {
          // 보간 없이 점프
          states[pname].x = n.x;
          states[pname].y = n.y;
        } else {
          const ratio = (currentTimeMs - p.time) / (n.time - p.time);
          states[pname].x = p.x + (n.x - p.x) * ratio;
          states[pname].y = p.y + (n.y - p.y) * ratio;
        }
      }
    }
  }, [currentTimeMs, events]);

  return {
    events,
    teammates,
    teamNames,
    zoneEvents,
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
