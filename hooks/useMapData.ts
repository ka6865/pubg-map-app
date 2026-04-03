import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { MapMarker, NotificationItem, UserProfile, AuthUser, PendingVehicle } from "../types/map";

export function useMapData(activeMapId: string) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [optimisticNickname, setOptimisticNickname] = useState<string | null>(
    null
  );
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dbVehicles, setDbVehicles] = useState<MapMarker[]>([]);

  // 🌟 [추가] 대기 중인 제보 데이터를 담을 상태!
  const [pendingVehicles, setPendingVehicles] = useState<PendingVehicle[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const fetchUserProfile = async (user: AuthUser) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (data) {
      setUserProfile(data as UserProfile);
    } else {
      const emailPrefix = user.email?.split("@")[0] || "익명";
      await supabase
        .from("profiles")
        .insert([{ id: user.id, nickname: emailPrefix }]);
      setUserProfile({ nickname: emailPrefix });
    }
  };

  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (data) {
      setNotifications(data as NotificationItem[]);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setCurrentUser(session.user);
        await fetchUserProfile(session.user);
        fetchNotifications(session.user.id);
      }
      setIsAuthLoading(false);

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setCurrentUser(session.user);
          await fetchUserProfile(session.user);
          fetchNotifications(session.user.id);
        } else {
          setCurrentUser(null);
          setUserProfile(null);
          setOptimisticNickname(null);
        }
      });

      return () => subscription.unsubscribe();
    };
    initAuth();
  }, []);

  useEffect(() => {
    const fetchMarkers = async () => {
      if (activeMapId === "Board" || activeMapId === "Stats") return;

      // 맵 전환 시 이전 마커 잔상을 제거하기 위해 즉시 초기화
      setDbVehicles([]);
      setPendingVehicles([]); // 🌟 대기소 초기화 추가

      // 1. 병렬 처리를 통해 렌더링 속도 최적화 (폭포수 현상 제거)
      const [mapResponse, pendingResponse] = await Promise.all([
        supabase.from("map_markers").select("*").eq("map_id", activeMapId),
        supabase.from("pending_markers").select("*").eq("map_name", activeMapId)
      ]);

      const mapData = mapResponse.data;
      const pendingData = pendingResponse.data;

      const combined: MapMarker[] = mapData
        ? mapData.map((m: Record<string, any>) => ({ ...m, mapId: m.map_id || activeMapId }) as MapMarker)
        : [];

      setDbVehicles(combined);

      if (pendingData) {
        setPendingVehicles(pendingData);
      }
    };
    fetchMarkers();
  }, [activeMapId]);

  return {
    currentUser,
    userProfile,
    optimisticNickname,
    notifications,
    dbVehicles,
    pendingVehicles,
    isAuthLoading,
    setOptimisticNickname,
    setNotifications,
    fetchUserProfile,
  };
}
