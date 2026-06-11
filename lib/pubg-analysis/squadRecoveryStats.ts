import type { TimelineEvent } from "./types";

const SMOKE_RESCUE_SMOKE_WINDOW_MS = 15_000;
const SMOKE_RESCUE_REVIVE_WINDOW_MS = 30_000;
const SMOKE_RESCUE_MAX_DISTANCE_M = 100;

export interface SquadSmokeRescueCandidate {
  id: string;
  victim: string;
  knockTs: number;
  smokeTs: number;
  reviveTs: number;
  smokeUser?: string;
  reviver?: string;
  smokeDeltaMs: number;
  reviveDeltaMs: number;
  smokeDistanceM: number | null;
}

export interface SquadRecoveryStats {
  squadRevives: number;
  squadSmokeRescues: number;
  smokeRescueCandidates: SquadSmokeRescueCandidate[];
}

function normalizeName(name?: string): string {
  return (name || "").replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

function isSmokeEvent(event: TimelineEvent): boolean {
  if (event.type !== "ITEM_USE") return false;
  const weapon = (event.weapon || "").toLowerCase();
  return weapon.includes("smoke") || weapon.includes("m79") || weapon.includes("연막");
}

export function hasSquadRecoveryTimelineSignals(timeline: TimelineEvent[] = []): boolean {
  return timeline.some(event =>
    event.type === "TEAM_KNOCK" ||
    event.type === "DOWNED" ||
    event.type === "REVIVE" ||
    event.type === "TEAM_REVIVE" ||
    isSmokeEvent(event)
  );
}

function getEventPoint(event: TimelineEvent): { x: number; y: number } | null {
  const x = typeof event.x === "number" ? event.x : event.victimX;
  const y = typeof event.y === "number" ? event.y : event.victimY;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (x === 0 && y === 0) return null;
  return { x, y };
}

function getDistanceM(a: TimelineEvent, b: TimelineEvent): number | null {
  const pointA = getEventPoint(a);
  const pointB = getEventPoint(b);
  if (!pointA || !pointB) return null;

  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  return Math.hypot(dx, dy);
}

function getActorName(event: TimelineEvent): string | undefined {
  return event.playerName || event.attacker;
}

export function deriveSquadRecoveryStatsFromTimeline(timeline: TimelineEvent[] = []): SquadRecoveryStats {
  const sortedTimeline = [...timeline].sort((a, b) => a.ts - b.ts);
  const knockEvents = sortedTimeline.filter(event =>
    (event.type === "TEAM_KNOCK" || event.type === "DOWNED") && normalizeName(event.victim)
  );
  const smokeEvents = sortedTimeline.filter(isSmokeEvent);
  const reviveEvents = sortedTimeline.filter(event =>
    (event.type === "REVIVE" || event.type === "TEAM_REVIVE") && normalizeName(event.victim)
  );

  const uniqueReviveKeys = new Set<string>();
  reviveEvents.forEach(event => {
    uniqueReviveKeys.add(`${normalizeName(event.victim)}:${event.ts}`);
  });

  const smokeRescueCandidates: SquadSmokeRescueCandidate[] = [];
  const usedRevives = new Set<string>();

  knockEvents.forEach(knock => {
    const victimName = normalizeName(knock.victim);
    const smoke = smokeEvents.find(event => {
      if (event.ts < knock.ts || event.ts - knock.ts > SMOKE_RESCUE_SMOKE_WINDOW_MS) return false;
      const distance = getDistanceM(event, knock);
      return distance === null || distance <= SMOKE_RESCUE_MAX_DISTANCE_M;
    });
    if (!smoke) return;

    const revive = reviveEvents.find(event => {
      if (normalizeName(event.victim) !== victimName) return false;
      if (event.ts < knock.ts || event.ts - knock.ts > SMOKE_RESCUE_REVIVE_WINDOW_MS) return false;
      return !usedRevives.has(`${victimName}:${event.ts}`);
    });
    if (!revive) return;

    const rescueKey = `${victimName}:${knock.ts}`;
    usedRevives.add(`${victimName}:${revive.ts}`);

    smokeRescueCandidates.push({
      id: rescueKey,
      victim: knock.victim || victimName,
      knockTs: knock.ts,
      smokeTs: smoke.ts,
      reviveTs: revive.ts,
      smokeUser: getActorName(smoke),
      reviver: getActorName(revive),
      smokeDeltaMs: smoke.ts - knock.ts,
      reviveDeltaMs: revive.ts - knock.ts,
      smokeDistanceM: getDistanceM(smoke, knock)
    });
  });

  return {
    squadRevives: uniqueReviveKeys.size,
    squadSmokeRescues: smokeRescueCandidates.length,
    smokeRescueCandidates
  };
}
