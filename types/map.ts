import type { DivIcon } from "leaflet";

export interface MapMarker {
  id: string | number;
  name: string;
  type: string;
  x: number;
  y: number;
  mapId: string;
  [key: string]: unknown;
}

export interface UserProfile {
  id?: string;
  nickname: string;
  role?: string;
}

export interface NotificationItem {
  id: string | number;
  user_id: string;
  sender_name: string;
  type: "reply" | "comment";
  post_id: string | number;
  is_read: boolean;
  preview_text?: string;
  created_at: string;
}

export interface MapTab {
  id: string;
  label: string;
  imageUrl: string;
}

export interface MapFilters {
  [key: string]: boolean;
}

export interface MapViewProps {
  activeMapId: string;
  currentMap: MapTab | undefined;
  bounds: [[number, number], [number, number]];
  visibleVehicles: MapMarker[];
  icons: Record<string, DivIcon>;
  imageHeight: number;
  imageWidth: number;
}
