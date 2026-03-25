import React, { memo } from "react";
import Sidebar from "../Sidebar";
import MapView from "./MapView";
import type { MapFilters, MapMarker, MapTab } from "../../types/map";

interface MapShellProps {
  isMobile: boolean;
  isSidebarOpen: boolean;
  activeMapId: string;
  currentMap: MapTab | undefined;
  filters: MapFilters;
  visibleVehicles: MapMarker[];
  bounds: [[number, number], [number, number]];
  icons: Record<string, import("leaflet").DivIcon>;
  imageHeight: number;
  imageWidth: number;
  onCloseSidebar: () => void;
  onSetSidebarOpen: (open: boolean) => void;
  onToggleFilter: (id: string) => void;
  onGetCount: (type: string) => number;
  onEnableDefaultVehicleFilters: () => void;
}

const MapShell = memo(
  ({
    isMobile,
    isSidebarOpen,
    activeMapId,
    currentMap,
    filters,
    visibleVehicles,
    bounds,
    icons,
    imageHeight,
    imageWidth,
    onCloseSidebar,
    onSetSidebarOpen,
    onToggleFilter,
    onGetCount,
    onEnableDefaultVehicleFilters,
  }: MapShellProps) => {
    return (
      <>
        {isMobile && isSidebarOpen && (
          <div
            onClick={onCloseSidebar}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              zIndex: 5499,
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 5500,
            display: isSidebarOpen ? "flex" : "none",
            width: "260px",
            backgroundColor: "#1a1a1a",
            borderRight: "1px solid #333",
          }}
        >
          <Sidebar
            isOpen={isSidebarOpen}
            setIsOpen={onSetSidebarOpen}
            mapLabel={currentMap?.label || ""}
            activeMapId={activeMapId}
            filters={filters}
            toggleFilter={onToggleFilter}
            getCount={onGetCount}
          />
        </div>

        <div style={{ flex: 1, position: "relative" }}>
          <MapView
            activeMapId={activeMapId}
            currentMap={currentMap}
            bounds={bounds}
            visibleVehicles={visibleVehicles}
            icons={icons}
            imageHeight={imageHeight}
            imageWidth={imageWidth}
            onEnableDefaultVehicleFilters={onEnableDefaultVehicleFilters}
          />
        </div>
      </>
    );
  }
);

MapShell.displayName = "MapShell";
export default MapShell;
