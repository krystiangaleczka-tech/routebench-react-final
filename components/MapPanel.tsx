

import React, { useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import { RouteResult, Stop, RouteStats } from '../types';
import { Car, Zap, Clock, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import L from 'leaflet';

interface MapPanelProps {
  title: string;
  result: RouteResult;
  color: string;
  previousStats?: RouteStats;
  rating?: number;
  onRate?: (rating: number) => void;
}

const colorMap: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  emerald: '#10b981',
  purple: '#a855f7',
  orange: '#f97316',
  pink: '#ec4899',
  indigo: '#6366f1',
  cyan: '#06b6d4',
  teal: '#14b8a6',
  rose: '#f43f5e', 
  violet: '#8b5cf6', 
  lime: '#84cc16', 
  amber: '#f59e0b', 
  fuchsia: '#d946ef', 
  zinc: '#71717a',
  sky: '#0ea5e9',
  stone: '#78716c',
  neutral: '#737373',
  slate: '#64748b',
  gray: '#6b7280',
};

// Optimized component to handle marker rendering based on viewport visibility
const OptimizedMarkers = ({ stops }: { stops: Stop[] }) => {
  const map = useMap();
  // Map to store markers by Stop ID for efficient diffing
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!map) return;

    // Optimization Threshold:
    // If we have fewer than 200 stops, Leaflet handles them easily without culling.
    // Culling small lists actually hurts UX (pop-in effect during drag).
    // We only enable viewport culling for large datasets.
    const SHOULD_CULL = stops.length > 200;

    const renderMarkers = () => {
      // 1. Determine which stops should be visible
      let visibleStops: Stop[] = stops;
      
      if (SHOULD_CULL) {
        const bounds = map.getBounds();
        // Add 100% padding (1x viewport size) to bounds so markers are pre-rendered
        // for smoother panning (preventing pop-in during fast drags)
        const paddedBounds = bounds.pad(1); 
        visibleStops = stops.filter(stop => 
          paddedBounds.contains([stop.coordinates.lat, stop.coordinates.lng])
        );
      }

      const visibleIds = new Set(visibleStops.map(s => s.id));

      // 2. Diffing: Remove markers that are no longer visible
      // We iterate over EXISTING markers on the map
      const toRemove: string[] = [];
      markersRef.current.forEach((marker, id) => {
        if (!visibleIds.has(id)) {
          marker.remove(); // Remove from Leaflet map
          toRemove.push(id);
        }
      });
      // Update our reference map
      toRemove.forEach(id => markersRef.current.delete(id));

      // 3. Diffing: Add markers that are newly visible
      visibleStops.forEach((stop, idx) => {
        // Only create if it doesn't exist yet
        if (!markersRef.current.has(stop.id)) {
           const isStart = idx === 0;
           const isEnd = idx === stops.length - 1;
           
           // Dynamic styling
           let bgClass = 'bg-blue-500';
           let shadowClass = 'shadow-blue-500/50';
           
           if (isStart) { bgClass = 'bg-emerald-500'; shadowClass = 'shadow-emerald-500/50'; }
           if (isEnd) { bgClass = 'bg-red-500'; shadowClass = 'shadow-red-500/50'; }

           const icon = L.divIcon({
             className: '', 
             html: `
               <div class="relative flex items-center justify-center w-6 h-6 -translate-x-1.5 -translate-y-1.5 group cursor-pointer">
                 <div class="absolute w-full h-full ${bgClass} rounded-full opacity-30 group-hover:opacity-60 animate-pulse transition-opacity"></div>
                 <div class="relative w-3 h-3 ${bgClass} rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] ${shadowClass} border border-white/20"></div>
               </div>
             `,
             iconSize: [12, 12],
             iconAnchor: [6, 6], 
           });

           const marker = L.marker([stop.coordinates.lat, stop.coordinates.lng], {
             icon: icon,
             riseOnHover: true
           });

           marker.bindTooltip(
             `<div class="font-bold text-gray-200">${idx + 1}.</div><div class="text-gray-400 text-[10px] whitespace-nowrap">${stop.address}</div>`, 
             {
               direction: 'top',
               offset: [0, -8],
               opacity: 1,
               className: 'bg-gray-900/95 border border-gray-700 backdrop-blur-md px-2 py-1.5 rounded-lg shadow-xl flex gap-2 items-center'
             }
           );

           marker.addTo(map);
           markersRef.current.set(stop.id, marker);
        }
      });
    };

    // Initial Render
    renderMarkers();

    // Only attach listener if we are actually culling
    if (SHOULD_CULL) {
      map.on('moveend', renderMarkers);
    }

    return () => {
      if (SHOULD_CULL) {
        map.off('moveend', renderMarkers);
      }
      // Cleanup all markers on unmount
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current.clear();
    };
  }, [map, stops]);

  return null;
};

// Helper component for delta display
const DeltaStat = ({ val, unit, reverse = false, isFloat = false }: { val: number, unit: string, reverse?: boolean, isFloat?: boolean }) => {
  if (Math.abs(val) < 0.001) return <span className="text-gray-600 flex items-center"><Minus className="w-2.5 h-2.5 mr-0.5"/>0</span>;
  
  const isPositive = val > 0;
  // Normally positive increase in distance/time is BAD (Red).
  // If reverse is true, positive is GOOD (Green) - not used here yet.
  const isBad = reverse ? !isPositive : isPositive; 
  
  const colorClass = isBad ? 'text-red-400' : 'text-emerald-400';
  const Icon = isPositive ? ArrowUp : ArrowDown;
  
  return (
    <span className={`${colorClass} flex items-center font-mono font-bold`}>
      <Icon className="w-2.5 h-2.5 mr-0.5" />
      {Math.abs(val).toFixed(isFloat ? 1 : 0)}{unit}
    </span>
  );
};

const MapPanel: React.FC<MapPanelProps> = ({ title, result, color, previousStats, rating = 0, onRate }) => {
  const { path, stats, geometry } = result;
  const mapRef = useRef<L.Map>(null);

  const polylinePositions = useMemo(() => {
    if (geometry && geometry.length > 0) {
      return geometry;
    }
    return path.map(stop => [stop.coordinates.lat, stop.coordinates.lng] as [number, number]);
  }, [path, geometry]);

  const hexColor = colorMap[color] || '#ffffff';

  const center: [number, number] = useMemo(() => {
    if (path.length === 0) return [50.34, 19.05];
    const lats = path.map(p => p.coordinates.lat);
    const lngs = path.map(p => p.coordinates.lng);
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2
    ];
  }, [path]);

  // Fix for mobile drag lag
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const container = map.getContainer();

    const handleTouch = (e: TouchEvent) => {
        if (e.cancelable) {
            e.preventDefault();
        }
    };

    const options = { passive: false };
    container.addEventListener('touchstart', handleTouch, options);
    container.addEventListener('touchmove', handleTouch, options);

    return () => {
        container.removeEventListener('touchstart', handleTouch);
        container.removeEventListener('touchmove', handleTouch);
    };
  }, []);

  return (
    <div className={`flex flex-col h-full bg-gray-900 rounded-[2rem] overflow-hidden border shadow-xl transition-colors duration-300 ${stats.isRoadData ? `border-${color}-900` : 'border-gray-800'}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex flex-col space-y-3 bg-gray-800/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white truncate pr-2" title={title}>{title}</h3>
          <div className="flex items-center gap-2 shrink-0">
             {stats.isRoadData && (
               <div className="flex items-center text-[10px] uppercase font-bold text-gray-500 bg-gray-900 px-2.5 py-1 rounded-lg">
                 <Car className="w-3 h-3 mr-1" /> Road
               </div>
             )}
             <span className={`px-3 py-1 text-xs font-mono rounded-lg bg-${color}-900 text-${color}-200 border border-${color}-700`}>
              {path.length} pts
            </span>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 text-xs lg:text-sm">
          {/* Distance */}
          <div className="flex flex-col">
            <div className="flex items-center space-x-1">
              <span className="text-gray-400">Dist:</span>
              <span className="font-mono text-white">{stats.distanceKm.toFixed(1)}km</span>
            </div>
            {previousStats && (
              <div className="text-[10px] mt-0.5">
                <DeltaStat val={stats.distanceKm - previousStats.distanceKm} unit="km" isFloat />
              </div>
            )}
          </div>

          {/* Time */}
          <div className="flex flex-col">
            <div className="flex items-center space-x-1">
              <span className="text-gray-400">Calc:</span>
              <span className={`font-mono text-${stats.calculationTimeMs < 10 ? 'emerald' : 'yellow'}-400 flex items-center`}>
                <Zap className="w-3 h-3 mr-1" />
                {stats.calculationTimeMs.toFixed(0)}ms
              </span>
            </div>
            {previousStats && (
              <div className="text-[10px] mt-0.5">
                <DeltaStat val={stats.calculationTimeMs - previousStats.calculationTimeMs} unit="ms" />
              </div>
            )}
          </div>

          {/* ETA */}
          <div className="flex flex-col">
             <div className="flex items-center space-x-1">
               <span className="text-gray-400">ETA:</span>
               <span className="font-mono text-blue-300 flex items-center">
                 <Clock className="w-3 h-3 mr-1" />
                 {stats.eta || '--'}
               </span>
            </div>
            {previousStats && stats.durationMinutes !== undefined && previousStats.durationMinutes !== undefined && (
               <div className="text-[10px] mt-0.5">
                 <DeltaStat val={stats.durationMinutes - previousStats.durationMinutes} unit="m" />
               </div>
            )}
          </div>

          {/* Rating */}
          <div className="flex flex-col">
            <div className="flex items-center space-x-1">
              <span className="text-gray-400">Ocena:</span>
              <input 
                type="number" 
                min="1" max="10" 
                value={rating || ''} 
                onChange={(e) => onRate && onRate(parseInt(e.target.value) || 0)}
                placeholder="-"
                className="w-10 bg-gray-800 border border-gray-700 text-white text-center rounded px-0 py-0.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {/* Placeholder for alignment with deltas if needed, or empty */}
            {previousStats && <div className="h-4"></div>}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 min-h-[300px] relative isolate">
        <MapContainer 
          ref={mapRef}
          center={center} 
          zoom={10} 
          scrollWheelZoom={false} 
          preferCanvas={true}
          className="h-full w-full"
          style={{ background: '#111827', touchAction: 'none' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          
          <Polyline 
            positions={polylinePositions} 
            pathOptions={{ 
              color: hexColor, 
              weight: 3, 
              opacity: 0.8,
              dashArray: stats.isRoadData ? undefined : '5, 10'
            }} 
          />

          <OptimizedMarkers stops={path} />
        </MapContainer>
      </div>
    </div>
  );
};

export default MapPanel;