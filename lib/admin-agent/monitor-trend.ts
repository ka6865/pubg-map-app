export type AgentMonitorTrendDirection = "improving" | "stable" | "worsening" | "insufficient_data";

export interface AgentMonitorTrendSnapshot {
  generatedAt: string;
  completedAt?: string | null;
  severity: "ok" | "warn" | "critical";
  alertCount: number;
  gateBlockCount: number;
  checkoutScore?: number | null;
}

export interface AgentMonitorTrend {
  generatedAt: string;
  direction: AgentMonitorTrendDirection;
  label: string;
  sampleSize: number;
  summary: string;
  latest?: AgentMonitorTrendSnapshot | null;
  previous?: AgentMonitorTrendSnapshot | null;
  deltas: {
    severityScore: number;
    alertCount: number;
    gateBlockCount: number;
    checkoutScore: number;
  };
  recommendation: string;
}

const severityScores = {
  ok: 0,
  warn: 1,
  critical: 2
} as const;

export function buildAgentMonitorTrend(rows: Array<{ summary?: string | null; completed_at?: string | null }>): AgentMonitorTrend {
  const snapshots = rows
    .map((row) => normalizeMonitorSnapshot(row))
    .filter((snapshot): snapshot is AgentMonitorTrendSnapshot => Boolean(snapshot))
    .slice(0, 7);

  if (snapshots.length < 2) {
    const latest = snapshots[0] || null;
    return {
      generatedAt: new Date().toISOString(),
      direction: "insufficient_data",
      label: "추세 데이터 부족",
      sampleSize: snapshots.length,
      summary: latest
        ? "monitor snapshot이 1개뿐이라 변화 방향은 아직 판단하지 않습니다."
        : "아직 비교 가능한 monitor snapshot이 없습니다.",
      latest,
      previous: null,
      deltas: { severityScore: 0, alertCount: 0, gateBlockCount: 0, checkoutScore: 0 },
      recommendation: "GitHub Actions 또는 수동 점검으로 monitor snapshot을 2회 이상 쌓은 뒤 추세를 보세요."
    };
  }

  const latest = snapshots[0];
  const previous = snapshots[1];
  const deltas = {
    severityScore: severityScores[latest.severity] - severityScores[previous.severity],
    alertCount: latest.alertCount - previous.alertCount,
    gateBlockCount: latest.gateBlockCount - previous.gateBlockCount,
    checkoutScore: Number(latest.checkoutScore || 0) - Number(previous.checkoutScore || 0)
  };
  const pressureDelta = deltas.severityScore * 3 + deltas.alertCount + deltas.gateBlockCount * 2 - Math.sign(deltas.checkoutScore);
  const direction: AgentMonitorTrendDirection = pressureDelta >= 2
    ? "worsening"
    : pressureDelta <= -2
      ? "improving"
      : "stable";

  return {
    generatedAt: new Date().toISOString(),
    direction,
    label: getTrendLabel(direction),
    sampleSize: snapshots.length,
    summary: buildTrendSummary(direction, latest, previous, deltas),
    latest,
    previous,
    deltas,
    recommendation: getTrendRecommendation(direction, latest)
  };
}

function normalizeMonitorSnapshot(row: { summary?: string | null; completed_at?: string | null }): AgentMonitorTrendSnapshot | null {
  const parsed: any = parseJson(row.summary);
  if (!parsed || typeof parsed !== "object") return null;
  const severity: AgentMonitorTrendSnapshot["severity"] = parsed.severity === "critical" || parsed.severity === "warn" ? parsed.severity : "ok";
  return {
    generatedAt: parsed.generatedAt || row.completed_at || new Date().toISOString(),
    completedAt: row.completed_at || null,
    severity,
    alertCount: Array.isArray(parsed.alerts) ? parsed.alerts.length : 0,
    gateBlockCount: Number(parsed.approvalGateSummary?.blockCount || 0),
    checkoutScore: typeof parsed.dailyCheckout?.score === "number" ? parsed.dailyCheckout.score : null
  };
}

function buildTrendSummary(
  direction: AgentMonitorTrendDirection,
  latest: AgentMonitorTrendSnapshot,
  previous: AgentMonitorTrendSnapshot,
  deltas: AgentMonitorTrend["deltas"]
) {
  const pieces = [
    `severity ${previous.severity} -> ${latest.severity}`,
    `alerts ${formatDelta(deltas.alertCount)}`,
    `gate block ${formatDelta(deltas.gateBlockCount)}`
  ];
  if (latest.checkoutScore !== null && previous.checkoutScore !== null) {
    pieces.push(`checkout ${formatDelta(deltas.checkoutScore)}`);
  }
  return `${getTrendLabel(direction)}: ${pieces.join(" · ")}`;
}

function getTrendLabel(direction: AgentMonitorTrendDirection) {
  if (direction === "improving") return "개선 중";
  if (direction === "worsening") return "악화 조짐";
  if (direction === "stable") return "안정 추세";
  return "추세 데이터 부족";
}

function getTrendRecommendation(direction: AgentMonitorTrendDirection, latest: AgentMonitorTrendSnapshot) {
  if (direction === "worsening") return "Owner Brief의 do-now와 approval gate를 먼저 확인하고, 필요하면 사고 타임라인을 저장하세요.";
  if (direction === "improving") return "개선 원인을 Daily Ops Digest 또는 memory로 남겨 다음 유사 상황에서 재사용하세요.";
  if (latest.gateBlockCount > 0) return "추세는 안정적이지만 Execution Gate block은 승인하지 말고 payload를 보강해 재요청하세요.";
  return "현재 추세는 안정적입니다. 다음 monitor snapshot까지 watch 상태를 유지하세요.";
}

function formatDelta(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function parseJson(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
