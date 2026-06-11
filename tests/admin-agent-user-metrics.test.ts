import { describe, expect, it, vi } from "vitest";
import { buildUserMetricsSummary, renderUserMetricsSummaryText } from "@/lib/admin-agent/user-metrics";

describe("admin agent user metrics", () => {
  it("전적 검색 대상 닉네임과 로그인 활동 회원을 분리한다", async () => {
    const supabase = createSupabaseMock({
      authUsers: [
        { id: "user-1", email: "user@example.com", created_at: new Date().toISOString(), last_sign_in_at: null }
      ],
      profiles: [
        {
          id: "user-1",
          nickname: "갱얼둥",
          role: "user",
          pubg_nickname: "KangHeeSung_",
          last_active_at: null,
          updated_at: null
        }
      ],
      analyticsRows: [
        {
          event_name: "page_view",
          session_id: "guest-session",
          user_id: null,
          page_path: "/stats/steam/KangHeeSung_",
          params: {},
          created_at: new Date().toISOString()
        },
        {
          event_name: "stats_searched",
          session_id: "guest-session",
          user_id: null,
          page_path: "/stats",
          params: { nickname: "KangHeeSung_", platform: "steam" },
          created_at: new Date().toISOString()
        }
      ]
    });

    const summary = await buildUserMetricsSummary(supabase, 24);
    const text = renderUserMetricsSummaryText(summary);

    expect(summary.activity.analyticsLoggedInUsers).toBe(0);
    expect(summary.topSearchedTargets[0]).toMatchObject({
      nickname: "KangHeeSung_",
      platform: "steam",
      count: 2,
      matchingProfileLabels: ["갱얼둥"]
    });
    expect(text).toContain("이 값은 조회 대상 닉네임이며 해당 회원의 로그인 활동으로 해석하지 않습니다.");
  });
});

function createSupabaseMock(input: {
  authUsers: any[];
  profiles: any[];
  analyticsRows: any[];
}) {
  return {
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue({ data: { users: input.authUsers }, error: null })
      }
    },
    from(table: string) {
      const chain: any = {
        select: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(async () => ({ data: table === "profiles" ? input.profiles : [], error: null })),
        limit: vi.fn(async () => ({ data: table === "analytics_events" ? input.analyticsRows : [], error: null }))
      };
      return chain;
    }
  };
}
