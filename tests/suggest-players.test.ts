import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../app/api/pubg/player/route';

// Supabase Server Client Mock
vi.mock('@/utils/supabase/server', () => {
  return {
    createClient: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      rpc: vi.fn((rpcName) => {
        if (rpcName === "suggest_similar_players") {
          return Promise.resolve({
            data: [
              { nickname: "iMISSiiiiiiiii", platform: "steam" },
              { nickname: "iMISS", platform: "steam" }
            ],
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      })
    }))
  };
});

// Global fetch Mocking을 위한 백업
const globalFetch = global.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = globalFetch;
});

describe('유사 닉네임 추천 404 Fallback API 테스트', () => {
  it('존재하지 않는 닉네임(404) 조회 시 pg_trgm RPC를 통해 유사 닉네임 목록을 suggestions 배열로 반환해야 함', async () => {
    // PUBG API가 404를 반환하도록 Mocking
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ errors: [{ detail: "Not Found" }] })
    } as any);

    const req = new Request('http://localhost/api/pubg/player?nickname=imissii&platform=steam');
    const response = await GET(req);
    
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('존재하지 않는 닉네임입니다');
    expect(body.suggestions).toBeDefined();
    expect(body.suggestions).toHaveLength(2);
    expect(body.suggestions[0].nickname).toBe("iMISSiiiiiiiii");
    expect(body.suggestions[0].platform).toBe("steam");
  });
});
