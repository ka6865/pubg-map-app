/**
 * BGMS Analytics Utility
 * GA4(gtag) 커스텀 이벤트 래퍼 — 타입 안전, 서버 사이드 safe
 */

// ─── 이벤트 정의 ────────────────────────────────────────────────────────────

export type BgmsEvent =
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
        feature_name: "ai-coaching" | "squad-synergy" | "battle-compare" | "2d-replay";
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

/**
 * GA4에 커스텀 이벤트 발송.
 * 클라이언트 전용 — SSR 환경에서는 자동 skip.
 */
export function trackEvent(event: BgmsEvent): void {
  if (typeof window === "undefined") return;
  if (typeof (window as any).gtag !== "function") return;

  (window as any).gtag("event", event.name, event.params);
}

