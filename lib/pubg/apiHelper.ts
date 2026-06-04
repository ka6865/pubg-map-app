interface ApiErrorRecord {
  timestamp: number;
  route: string;
  status: number;
  message: string;
  detail?: string;
}

// 전역 에러 리스트 (슬라이딩 윈도우 감시용)
let errorQueue: ApiErrorRecord[] = [];
let lastAlertSentAt = 0;

const ALERT_COOLDOWN = 10 * 60 * 1000; // 10분 쿨다운
const WINDOW_SIZE = 5 * 60 * 1000; // 5분 범위
const ERROR_THRESHOLD = 10; // 임계값 10회

/**
 * PUBG API 실패 건을 모니터링 큐에 기록하고,
 * 빈도가 높아질 경우 즉각 디스코드로 경고 웹훅을 발송합니다.
 */
export async function reportPubgApiError(
  route: string,
  status: number,
  message: string,
  detail?: string
) {
  const now = Date.now();
  errorQueue.push({ timestamp: now, route, status, message, detail });

  // 5분보다 오래된 만료 레코드 정리
  const cutOff = now - WINDOW_SIZE;
  errorQueue = errorQueue.filter(err => err.timestamp >= cutOff);

  console.warn(`[MONITORING] API Error Recorded - Route: ${route}, Status: ${status}, Message: ${message}`);

  // 5분 동안 발생한 에러 수가 임계치에 도달하고 쿨다운이 지난 경우 알림 전송
  if (errorQueue.length >= ERROR_THRESHOLD && now - lastAlertSentAt > ALERT_COOLDOWN) {
    lastAlertSentAt = now;
    await sendAlertToDiscord(errorQueue.length, [...errorQueue]);
  }
}

/**
 * 디스코드 채널로 상세 장애 정보를 포함한 리치 임베드 알림을 전송합니다.
 */
async function sendAlertToDiscord(errorCount: number, recentErrors: ApiErrorRecord[]) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("[MONITORING] DISCORD_WEBHOOK_URL env is missing, skipping alert.");
    return;
  }

  // 경로 및 상태 코드별 집계
  const routeStats: Record<string, number> = {};
  const statusStats: Record<number, number> = {};

  recentErrors.forEach(err => {
    routeStats[err.route] = (routeStats[err.route] || 0) + 1;
    statusStats[err.status] = (statusStats[err.status] || 0) + 1;
  });

  const routeSummary = Object.entries(routeStats)
    .map(([r, c]) => `• \`${r}\`: ${c}회`)
    .join("\n");
  const statusSummary = Object.entries(statusStats)
    .map(([s, c]) => `• Code \`${s}\`: ${c}회`)
    .join("\n");

  const latestError = recentErrors[recentErrors.length - 1];

  const embed = {
    title: "🚨 PUBG API 장애 감지 알림",
    description: "최근 5분간 PUBG API 호출 에러 빈도가 임계치를 초과하였습니다. 서비스 상태 모니터링 및 조치가 필요합니다.",
    color: 15158332, // Red color
    fields: [
      { name: "총 오류 발생 수 (5분간)", value: `${errorCount}회`, inline: true },
      { name: "기준 임계치", value: `5분 내 ${ERROR_THRESHOLD}회`, inline: true },
      { name: "오류 발생 경로 현황", value: routeSummary || "데이터 없음", inline: false },
      { name: "상태 코드 현황", value: statusSummary || "데이터 없음", inline: false },
      { name: "가장 최근 에러 상세", value: `\`\`\`json\n${JSON.stringify(latestError, null, 2)}\n\`\`\``, inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "BGMS API Auto Monitor System" }
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!res.ok) {
      throw new Error(`Discord API responded with code: ${res.status}`);
    }
    console.log("[MONITORING] Discord alert successfully sent.");
  } catch (err: any) {
    console.error("[MONITORING] Failed to dispatch Discord Alert:", err.message);
  }
}
