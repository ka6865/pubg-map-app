import {
  parseTelemetryPlatform,
  type TelemetryPlatform,
} from "./telemetryIdentity";

const DEMO_MATCH_ID = "c88f4f64-4f86-4f44-b40b-629bece6cdcf";
const DEMO_NICKNAME = "KangHeeSung_";
const QUERY_ERROR = "3D 리플레이 query가 누락되었거나 지원되지 않습니다.";

type Replay3DQuery = {
  matchId: string | null;
  nickname: string | null;
  platform: string | null;
};

export type Replay3DRequest = {
  matchId: string;
  nickname: string;
  platform: TelemetryPlatform;
  isDemo: boolean;
};

export function resolveReplay3DRequest(query: Replay3DQuery): Replay3DRequest {
  const values = [query.matchId, query.nickname, query.platform];
  if (values.every((value) => value === null)) {
    return {
      matchId: DEMO_MATCH_ID,
      nickname: DEMO_NICKNAME,
      platform: "steam",
      isDemo: true,
    };
  }
  if (values.some((value) => value === null)) throw new Error(QUERY_ERROR);

  try {
    return {
      matchId: query.matchId as string,
      nickname: query.nickname as string,
      platform: parseTelemetryPlatform(query.platform),
      isDemo: false,
    };
  } catch {
    throw new Error(QUERY_ERROR);
  }
}
