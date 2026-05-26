'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. 초기 세션 확인
    const getInitialSession = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      setSession(initialSession);
      setUser(initialSession?.user || null);
      setLoading(false);
    };

    getInitialSession();

    // 2. 인증 상태 변경 감지 (로그인, 로그아웃, 토큰 갱신 등)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 🌟 [추가] 최근 활동 시각(last_active_at) 트래킹 (10분 쿨다운)
  useEffect(() => {
    if (!user) return;

    const trackLastActive = async () => {
      try {
        const storageKey = `last_active_tracked_${user.id}`;
        const lastTracked = localStorage.getItem(storageKey);
        const now = Date.now();

        // 10분(600,000ms) 이내에 이미 업데이트했다면 차단 (Throttle)
        if (lastTracked && now - parseInt(lastTracked) < 10 * 60 * 1000) {
          return;
        }

        await supabase
          .from("profiles")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", user.id);

        localStorage.setItem(storageKey, now.toString());
      } catch (err) {
        console.error("Failed to track user activity:", err);
      }
    };

    // 브라우저 렌더링을 차단하지 않도록 다음 틱(tick)에 실행
    const timer = setTimeout(trackLastActive, 100);
    return () => clearTimeout(timer);
  }, [user]);

  return (
    <AuthContext.Provider value={{ session, user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// 편리하게 사용할 수 있는 커스텀 훅
export const useAuth = () => useContext(AuthContext);
