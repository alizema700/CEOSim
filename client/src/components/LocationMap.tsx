import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LocationProfile } from '@boardroom/shared';

/**
 * Echte Weltkarte (Leaflet) für die Standort-Wahl im Wizard (Phase 8).
 * Kacheln: CARTO „Positron" (frei nutzbar, keine API-Key-Pflicht) — helle,
 * reduzierte Optik, die zum Zeitungspapier-Theme passt statt bunte OSM-Standardkacheln.
 */

/** Echte Geokoordinaten der kuratierten Städte-Presets (client-seitig — die
 *  Engine kennt nur Wirtschaftsdaten, keine Geografie). */
const CITY_GEO: Record<string, [number, number]> = {
  muenchen: [48.1351, 11.582],
  berlin: [52.52, 13.405],
  hamburg: [53.5511, 9.9937],
  frankfurt: [50.1109, 8.6821],
  koeln: [50.9375, 6.9603],
  wien: [48.2082, 16.3738],
  zuerich: [47.3769, 8.5417],
  london: [51.5074, -0.1278],
  paris: [48.8566, 2.3522],
  amsterdam: [52.3676, 4.9041],
  stockholm: [59.3293, 18.0686],
  lissabon: [38.7223, -9.1393],
  warschau: [52.2297, 21.0122],
  newyork: [40.7128, -74.006],
  austin: [30.2672, -97.7431],
  singapur: [1.3521, 103.8198],
  bangalore: [12.9716, 77.5946],
  telaviv: [32.0853, 34.7818],
};

const dotIcon = (active: boolean) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:${active ? 16 : 11}px;height:${active ? 16 : 11}px;border-radius:999px;
      background:${active ? '#2f7f79' : '#171a1c'};
      border:2px solid #faf9f6;
      box-shadow:0 0 0 1px ${active ? '#2f7f79' : '#171a1c'}${active ? ',0 0 0 5px rgba(47,127,121,.18)' : ''};
    "></div>`,
    iconSize: [active ? 16 : 11, active ? 16 : 11],
    iconAnchor: [active ? 8 : 5.5, active ? 8 : 5.5],
  });

/** Zentriert die Karte neu, wenn sich der ausgewählte Standort ändert (z. B. nach Freitext-Suche). */
function FlyToSelected({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.flyTo(pos, Math.max(map.getZoom(), 4), { duration: 0.6 });
  }, [pos, map]);
  return null;
}

export function LocationMap({ cities, selected, onSelect }: {
  cities: LocationProfile[];
  selected: LocationProfile;
  onSelect: (p: LocationProfile) => void;
}) {
  const selectedGeo = CITY_GEO[selected.id] ?? null;
  return (
    <div className="border border-line bg-panel" style={{ borderRadius: 2, overflow: 'hidden' }}>
      <MapContainer
        center={[30, 15]}
        zoom={2}
        minZoom={2}
        maxBoundsViscosity={1}
        style={{ height: 380, width: '100%', background: '#eef0ea' }}
        scrollWheelZoom
        worldCopyJump
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={18}
        />
        {cities.map((c) => {
          const geo = CITY_GEO[c.id];
          if (!geo) return null;
          const active = c.id === selected.id;
          return (
            <Marker key={c.id} position={geo} icon={dotIcon(active)} eventHandlers={{ click: () => onSelect(c) }}>
              <Tooltip direction="top" offset={[0, -6]} opacity={1} className="br-map-tip">
                {c.nameDe} · {c.country}
              </Tooltip>
            </Marker>
          );
        })}
        <FlyToSelected pos={selectedGeo} />
      </MapContainer>
    </div>
  );
}
