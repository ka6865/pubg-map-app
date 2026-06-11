/**
 * BGMS Analytics Utility
 * GA4(gtag) 커스텀 이벤트 래퍼 — 타입 안전, 서버 사이드 safe
 */

// ─── 이벤트 정의 ────────────────────────────────────────────────────────────

export const ANALYTICS_EVENT_NAMES = [
  "page_view",
  "stats_searched",
  "battle_started",
  "battle_completed",
  "share_clicked",
  "squad_synergy_completed",
  "ai_squad_coaching_requested",
  "ai_analysis_opened",
  "replay_2d_opened",
  "tab_clicked",
  "map_viewed",
  "weapon_viewed",
  "feature_consumption",
  "crate_opened",
  "board_viewed",
  "post_viewed",
  "post_action"
] as const;

const MIRRORED_EVENTS = new Set<string>(ANALYTICS_EVENT_NAMES);
const SESSION_STORAGE_KEY = "bgms_analytics_session_id";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export type BgmsEvent =
  | {
      name: "page_view";
      params: {
        path: string;
        title?: string;
      };
    }
  | {
      name: "stats_searched";
      params: {
        nickname: string;
        platform: string;
        has_data: boolean;
        season_id?: string;
      };
    }
  | {
      name: "battle_started";
      params: {
        nick1: string;
        nick2: string;
        match_type: string;
      };
    }
  | {
      name: "battle_completed";
      params: {
        nick1: string;
        nick2: string;
        match_type: string;
        winner: string;             // nick1 | nick2 | draw
        score1: number;
        score2: number;
      };
    }
  | {
      name: "share_clicked";
      params: {
        method: "link_share" | "link_copy" | "image_share" | "image_copy" | "image_download";
        page: "stats" | "battle" | "squad";
      };
    }
  | {
      name: "squad_synergy_completed";
      params: {
        nickname: string;
        platform: string;
        match_count: number;
        members_count: number;
      };
    }
  | {
      name: "ai_squad_coaching_requested";
      params: {
        nickname: string;
        coaching_style: "spicy" | "mild";
        squad_grade: string;
      };
    }
  | {
      name: "ai_analysis_opened";
      params: { nickname: string; match_id: string };
    }
  | {
      name: "replay_2d_opened";
      params: { nickname: string; match_id: string };
    }
  | {
      name: "tab_clicked";
      params: { tab: string; nickname: string };
    }
  | {
      name: "map_viewed";
      params: {
        map_id: string;
        zoom_level?: number;
        view_mode?: string;
      };
    }
  | {
      name: "weapon_viewed";
      params: {
        weapon_id: string;
        category: string;
      };
    }
  | {
      name: "feature_consumption";
      params: {
        feature_name: "ai-coaching" | "squad-synergy" | "battle-compare" | "2d-replay" | "3d-replay" | "backpack-calculator" | "crate-simulator";
        status: "start" | "success" | "fail";
        error_type?: string;
      };
    }
  | {
      name: "crate_opened";
      params: {
        crate_id: string;
        open_count: number;
      };
    }
  | {
      name: "board_viewed";
      params: {
        category: string;
      };
    }
  | {
      name: "post_viewed";
      params: {
        post_id: string;
        category: string;
      };
    }
  | {
      name: "post_action";
      params: {
        action: "create_post" | "create_comment";
        status: "success" | "fail";
        error_type?: string;
      };
    };

// ─── 발송 함수 ──────────────────────────────────────────────────────────────

export function trackEvent(event: BgmsEvent): void {
  if (typeof window === "undefined") return;

  // 개발 환경(Local)에서 실시간으로 GA4 DebugView를 모니터링할 수 있도록 debug_mode 적용
  const params = {
    ...event.params,
    debug_mode: process.env.NODE_ENV === "development" ? true : undefined
  };

  if (typeof (window as any).gtag === "function") {
    (window as any).gtag("event", event.name, params);
  }

  void mirrorEventToSupabase(event);
}

async function mirrorEventToSupabase(event: BgmsEvent): Promise<void> {
  if (!MIRRORED_EVENTS.has(event.name)) return;
  if (process.env.NEXT_PUBLIC_ANALYTICS_MIRROR_DISABLED === "true") return;
  if (getAnalyticsMirrorSkipReason()) return;

  try {
    const payload = JSON.stringify({
      name: event.name,
      params: event.params,
      sessionId: getOrCreateSessionId(),
      pagePath: window.location.pathname,
      pageTitle: document.title || (event.name === "page_view" ? event.params.title : undefined),
      referrerPath: document.referrer ? toPath(document.referrer) : undefined,
      clientEnvironment: getClientAnalyticsEnvironment(),
      sourceHost: window.location.hostname,
      isInternal: isLocalHostname(window.location.hostname)
    });

    const accessToken = await getCurrentAccessToken();
    if (accessToken) {
      fetch("/api/analytics/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: payload,
        keepalive: true,
        credentials: "same-origin"
      }).catch(() => {
        // Analytics mirror must never affect user-facing features.
      });
      return;
    }

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      const accepted = navigator.sendBeacon("/api/analytics/event", blob);
      if (accepted) return;
    }

    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "same-origin"
    }).catch(() => {
      // Analytics mirror must never affect user-facing features.
    });
  } catch {
    // Ignore analytics mirror errors by design.
  }
}

function getAnalyticsMirrorSkipReason() {
  const allowLocalMirror = process.env.NEXT_PUBLIC_ANALYTICS_MIRROR_LOCAL === "true";
  const host = window.location.hostname;
  if (!allowLocalMirror && process.env.NODE_ENV === "development") return "development_environment";
  if (!allowLocalMirror && isLocalHostname(host)) return "local_host";

  const allowedHosts = (process.env.NEXT_PUBLIC_ANALYTICS_ALLOWED_HOSTS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length > 0 && !allowedHosts.includes(host.toLowerCase())) {
    return "host_not_allowed";
  }
  return null;
}

function getClientAnalyticsEnvironment() {
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  if (vercelEnv) return vercelEnv;
  return process.env.NODE_ENV === "development" ? "development" : "production";
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return LOCAL_HOSTS.has(normalized) || normalized.endsWith(".local");
}

async function getCurrentAccessToken() {
  try {
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

function getOrCreateSessionId() {
  try {
    const current = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (current) return current;
    const next = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function toPath(value: string) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}
