// BGMS Refreshed V2
import { useState, useEffect, useRef, useMemo } from "react";
import getApiUrl from "../lib/api-config";

export interface TelemetryEvent {
  type: "position" | "enemy_position" | "ride" | "leave" | "kill" | "groggy" | "took_damage" | "shot" | "revive" | "create" | "throw" | "throw_explode" | "grenade" | "smoke" | "damage";
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
  assistants?: string[];
  isSystem?: boolean;
}

export interface PlayerState {
  name: string;
  accountId?: string; // 🎯 계정 ID 필드 추가
  x: number;
  y: number;
  isDead: boolean;
  isGroggy: boolean;
  isInVehicle: boolean;
  isEnemy?: boolean;
  teamId?: number;
  health: number;
  kills: number;
  assists?: number;
  color?: string;
  vehicleId?: string;
  lastUpdateMs?: number;
  lastDeathMs?: number;
  deathX?: number; 
  deathY?: number; 
}

const TEAM_COLORS = [
  "#F2A900", "#34A853", "#3b82f6", "#ef4444", "#a855f7", "#ec4899", "#06b6d4", "#8b5cf6",
  "#f97316", "#10b981", "#3b82f6", "#f43f5e", "#fbbf24", "#22c55e", "#6366f1", "#d946ef"
];

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
  const [isFullMode, setIsFullMode] = useState(false);
  const teamColorMapRef = useRef<Record<number, string>>({});

  const fetchTelemetry = async (full: boolean = false) => {
    if (!matchId || !nickname || !mapName) return;
    setLoading(true);
    setError(null);
    try {
      const modeParam = full ? "&mode=full" : "&mode=lite";
      const apiUrl = getApiUrl(`/api/pubg/telemetry?matchId=${matchId}&nickname=${nickname}&mapName=${mapName}${modeParam}`);
      const res = await fetch(apiUrl);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to fetch telemetry");

      const evs = data.events || [];
      setEvents(evs);
      setTeammates(data.teammates || []);
      setTeamNames(data.teamNames || []);
      setZoneEvents(data.zoneEvents || []);
      setIsFullMode(full);

      const teamColorMap: Record<number, string> = {};
      let colorIdx = 0;
      evs.forEach((ev: any) => {
        if (ev.teamId != null && !teamColorMap[ev.teamId]) {
          if ((data.teammates || []).includes(ev.accountId) || (data.teamNames || []).includes(ev.name)) {
             teamColorMap[ev.teamId] = "#F2A900"; 
          } else {
             teamColorMap[ev.teamId] = TEAM_COLORS[colorIdx % TEAM_COLORS.length];
             colorIdx++;
          }
        }
      });
      teamColorMapRef.current = teamColorMap;

      if (evs.length > 0) {
        setMaxTimeMs(evs[evs.length - 1].relativeTimeMs || 0);
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

  const initialMode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("mode") : null;

  useEffect(() => {
    fetchTelemetry(initialMode === "full");
  }, [matchId, nickname, mapName, initialMode]);

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
    return () => { if (timerRef.current) cancelAnimationFrame(timerRef.current); };
  }, [isPlaying, playbackSpeed, maxTimeMs]);

  // 🚀 변수명 변경 및 위치 조정 (IDE 유령 에러 해결용)
  const statesRef = useRef<Record<string, PlayerState>>({});
  const lastProcessedTimeRef = useRef<number>(-1);
  const lastEventIndexRef = useRef<number>(0);
  const historyPosRef = useRef<Record<string, { x: number, y: number, time: number, health: number }>>({});
  const futurePosRef = useRef<Record<string, { x: number, y: number, time: number, health: number } | null>>({});

  const currentStates = useMemo(() => {
    if (events.length === 0) return {};

    const isJump = Math.abs(currentTimeMs - lastProcessedTimeRef.current) > 2000 || currentTimeMs < lastProcessedTimeRef.current;
    
    if (isJump) {
      statesRef.current = {};
      teamNames.forEach(name => {
        const pname = name.trim().toLowerCase();
        statesRef.current[pname] = {
          name, x: -9999, y: -9999, isDead: false, isGroggy: false, isInVehicle: false, health: 100, kills: 0, assists: 0, isEnemy: false
        };
      });
      lastEventIndexRef.current = 0;
      historyPosRef.current = {};
      futurePosRef.current = {};
    }

    const states = statesRef.current;
    const evs = events as any[];
    let i = lastEventIndexRef.current;

    while (i < evs.length && evs[i].relativeTimeMs <= currentTimeMs) {
      const ev = evs[i];
      const involved = new Set<string>();
      if (typeof ev.name === "string") involved.add(ev.name);
      if (typeof ev.victim === "string") involved.add(ev.victim);
      if (typeof ev.attacker === "string") involved.add(ev.attacker);
      if (Array.isArray(ev.assistants)) {
        ev.assistants.forEach((a: any) => {
          const aName = typeof a === "string" ? a : a.name;
          if (typeof aName === "string") involved.add(aName);
        });
      }

      involved.forEach(rawName => {
        if (typeof rawName !== "string") return;
        const pname = rawName.trim().toLowerCase();
        if (!pname) return;
        
        // 🎯 팩트: 시스템 플레이어("환경/자연사") 자체의 상태는 만들지 않되, 
        // 해당 플레이어가 가담한 이벤트(사망, 어시스트 등)는 다른 플레이어에게 반영되어야 함.
        if (!states[pname] && !ev.isSystem) {
          const isEnemy = !teamNames.map(t => t.trim().toLowerCase()).includes(pname);
          states[pname] = { 
            name: rawName, 
            accountId: ev.character?.accountId || ev.accountId, // 🎯 계정 ID 저장 추가
            x: -9999, y: -9999, isDead: false, isGroggy: false, isInVehicle: false, 
            health: 100, kills: 0, assists: 0, teamId: ev.teamId || 999,
            color: isEnemy ? (teamColorMapRef.current[ev.teamId] || "#ffffff") : "#F2A900",
            isEnemy: isEnemy
          };
        }
        const s = states[pname];
        if (!s) return; // 시스템 플레이어인 경우 s가 없을 수 있음 (의도됨)
        if (ev.type === "position" && ev.name === rawName) {
          s.x = ev.x; s.y = ev.y; s.health = ev.health ?? s.health; s.lastUpdateMs = ev.relativeTimeMs;
          historyPosRef.current[pname] = { x: ev.x, y: ev.y, time: ev.relativeTimeMs, health: s.health };
          futurePosRef.current[pname] = null;
        } else if (ev.type === "ride" && ev.name === rawName) {
          s.isInVehicle = true; s.vehicleId = ev.vehicle;
        } else if (ev.type === "leave" && ev.name === rawName) {
          s.isInVehicle = false; s.vehicleId = undefined;
        } else if (ev.type === "kill" || ev.type === "groggy") {
          // 🎯 팩트: Kill 뿐만 아니라 Groggy 이벤트에서도 어시스트를 집계함 (누락 방지)
          if (ev.victim === rawName) {
            if (ev.type === "kill") {
              s.isDead = true; s.isGroggy = false; s.health = 0; s.lastDeathMs = ev.relativeTimeMs; 
              s.deathX = ev.victimX || s.x || 0; s.deathY = ev.victimY || s.y || 0;
            } else {
              s.isGroggy = true; s.isDead = false; s.health = 0;
            }
          }
          if (ev.attacker === rawName) {
            if (ev.type === "kill") s.kills = (s.kills || 0) + 1;
            // Groggy는 킬로 치지 않음 (기존 로직 유지)
          }
          if (ev.assistants && Array.isArray(ev.assistants)) {
            const isAsst = ev.assistants.some((a: any) => {
              if (typeof a === "string") return a.trim().toLowerCase() === pname;
              const aName = (a.name || "").trim().toLowerCase();
              const aId = a.accountId || a.playerId;
              return aName === pname || (aId && aId === s.accountId);
            });
            if (isAsst) s.assists = (s.assists || 0) + 1;
          }
        } else if ((ev.type === "revive" || ev.type === "create") && (ev.victim === rawName || ev.name === rawName)) {
          s.isGroggy = false; s.isDead = false; if (ev.type === "revive") s.health = 10;
        }
      });
      i++;
    }

    lastEventIndexRef.current = i;
    lastProcessedTimeRef.current = currentTimeMs;

    const interpolatedStates: Record<string, PlayerState> = {};
    for (const pname in states) {
      const s = { ...states[pname] };
      if (!s.isDead) {
        if (!futurePosRef.current[pname]) {
          for (let j = i; j < evs.length; j++) {
            const nextEv = evs[j];
            if (nextEv.type === "position" && (nextEv.name || "").trim().toLowerCase() === pname) {
              futurePosRef.current[pname] = { x: nextEv.x, y: nextEv.y, time: nextEv.relativeTimeMs, health: nextEv.health || 100 };
              break;
            }
          }
        }
        const p = historyPosRef.current[pname];
        const n = futurePosRef.current[pname];
        if (p && n && p.time < n.time && p.time <= currentTimeMs && n.time > currentTimeMs) {
          const ratio = (currentTimeMs - p.time) / (n.time - p.time);
          s.x = p.x + (n.x - p.x) * ratio;
          s.y = p.y + (n.y - p.y) * ratio;
          s.health = p.health + (n.health - p.health) * ratio;
        }
      }
      interpolatedStates[pname] = s;
    }

    return interpolatedStates;
  }, [currentTimeMs, events, teamNames]);

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
    currentStates,
    isFullMode,
    fetchTelemetry,
  };
}
