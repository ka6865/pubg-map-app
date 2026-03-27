import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { LOCAL_MARKERS } from "../lib/local_data";
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

      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setCurrentUser(session.user);
          await fetchUserProfile(session.user);
        } else {
          setCurrentUser(null);
          setUserProfile(null);
          setOptimisticNickname(null);
        }
      });
    };
    initAuth();
  }, []);

  useEffect(() => {
    const fetchMarkers = async () => {
      if (activeMapId === "Board" || activeMapId === "Stats") return;

      // 맵 전환 시 이전 마커 잔상을 제거하기 위해 즉시 초기화
      setDbVehicles([]);
      setPendingVehicles([]); // 🌟 대기소 초기화 추가

      // 1. 기존 승인된 마커(map_markers) 불러오기
      const { data: mapData } = await supabase
        .from("map_markers")
        .select("*")
        .eq("map_id", activeMapId);

      const combined: MapMarker[] = mapData
        ? mapData.map((m: Record<string, any>) => ({ ...m, mapId: m.map_id || activeMapId }) as MapMarker)
        : [];

      LOCAL_MARKERS.forEach((lm: MapMarker) => {
        if (lm.mapId === activeMapId && !combined.find((v) => v.id === lm.id)) {
          combined.push(lm as MapMarker);
        }
      });
      setDbVehicles(combined);

      // 2. 🌟 대기 중인 제보(pending_markers) 불러오기
      const { data: pendingData } = await supabase
        .from("pending_markers")
        .select("*")
        .eq("map_name", activeMapId);

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
