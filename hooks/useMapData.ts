import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { LOCAL_MARKERS } from "../lib/local_data";
import type { MapMarker, NotificationItem, UserProfile } from "../types/map";

export function useMapData(activeMapId: string) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [optimisticNickname, setOptimisticNickname] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dbVehicles, setDbVehicles] = useState<MapMarker[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const fetchUserProfile = async (user: any) => {
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
      if (activeMapId === "Board") return;

      // 맵 전환 시 이전 마커 잔상을 제거하기 위해 즉시 초기화
      setDbVehicles([]);

      const { data } = await supabase
        .from("map_markers")
        .select("*")
        .eq("map_id", activeMapId);

      let combined: MapMarker[] = data ? data.map((m: any) => ({ ...m, mapId: m.map_id })) : [];
      
      LOCAL_MARKERS.forEach((lm: any) => {
        if (lm.mapId === activeMapId && !combined.find((v) => v.id === lm.id)) {
          combined.push(lm as MapMarker);
        }
      });
      setDbVehicles(combined);
    };
    fetchMarkers();
  }, [activeMapId]);

  return {
    currentUser,
    userProfile,
    optimisticNickname,
    notifications,
    dbVehicles,
    isAuthLoading,
    setOptimisticNickname,
    setNotifications,
    fetchUserProfile,
  };
}
