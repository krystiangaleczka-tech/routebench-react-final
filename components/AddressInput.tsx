
import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, Navigation } from 'lucide-react';
import { Stop, Coordinate } from '../types';

interface AddressInputProps {
  label: string;
  value: Stop;
  onChange: (stop: Stop) => void;
  color: 'blue' | 'emerald';
  referencePoint?: Coordinate; // Bias search around this point
}

interface NominatimResult {
  place_id: number;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    road?: string;
    pedestrian?: string;
    house_number?: string;
    suburb?: string;
    city_district?: string;
    neighbourhood?: string;
    quarter?: string;
    county?: string; // Powiat
    state?: string; // Województwo
    postcode?: string;
    country?: string;
  };
}

const AddressInput: React.FC<AddressInputProps> = ({ label, value, onChange, color, referencePoint }) => {
  const [query, setQuery] = useState(value.address);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 1. Get User Location on Mount (if no reference point provided)
  useEffect(() => {
    if (!referencePoint && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      });
    }
  }, [referencePoint]);

  // Sync internal query if external value changes
  useEffect(() => {
    setQuery(value.address);
  }, [value.address]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length > 2 && isOpen && query !== value.address) {
        setIsLoading(true);
        try {
          // Determine bias center (Reference Point > User Location)
          const center = referencePoint || userLocation;
          let viewboxParam = '';
          
          if (center) {
             // Create a tighter ~20km bounding box bias (approx 0.2 degrees)
             // This helps exclude distant cities (like Oświęcim) when searching locally in Silesia
             const offset = 0.2; 
             const x1 = center.lng - offset;
             const y1 = center.lat - offset;
             const x2 = center.lng + offset;
             const y2 = center.lat + offset;
             viewboxParam = `&viewbox=${x1},${y1},${x2},${y2}&bounded=1`;
          }

          // Strategy:
          // 1. Search for the exact query.
          // 2. If query ends with a number (e.g. "Szpitalna 36"), ALSO search for just the street ("Szpitalna").
          //    This fixes cases where "36" exists in a far city, but "36c" exists locally.
          //    Nominatim strict search would miss "36c" if we only ask for "36".
          
          const queries = [query];
          const numberMatch = query.match(/^(.*?)\s+(\d+[a-zA-Z]*)$/);
          
          if (numberMatch && numberMatch[1].length > 2) {
            queries.push(numberMatch[1]); // Add street-only query
          }

          const fetchPromises = queries.map(q => 
            fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=5${viewboxParam}`
            ).then(res => res.json())
          );

          const results = await Promise.all(fetchPromises);
          
          // Flatten and Deduplicate based on OSM ID
          const allResults = results.flat() as NominatimResult[];
          const uniqueResults: NominatimResult[] = [];
          const seenIds = new Set();

          for (const item of allResults) {
            if (!seenIds.has(item.place_id)) {
              seenIds.add(item.place_id);
              uniqueResults.push(item);
            }
          }

          setSuggestions(uniqueResults.slice(0, 8)); // Limit to 8 combined results
        } catch (e) {
          console.error("Failed to search address", e);
        } finally {
          setIsLoading(false);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, isOpen, value.address, referencePoint, userLocation]);

  const handleSelect = (item: NominatimResult) => {
    const a = item.address;
    const city = a.city || a.town || a.village || a.hamlet || '';
    const street = a.road || a.pedestrian || '';
    const number = a.house_number || '';
    
    // Format nicely: Street + Number OR Fallback to Name
    const addressShort = (street && number) 
        ? `${street} ${number}` 
        : (street || item.display_name.split(',')[0].trim());

    const newStop: Stop = {
      id: value.id,
      address: addressShort,
      city: city,
      coordinates: {
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      },
      notes: item.display_name
    };

    onChange(newStop);
    setQuery(addressShort);
    setIsOpen(false);
    setSuggestions([]);
  };

  // Helper to format suggestion display
  const formatSuggestionDisplay = (item: NominatimResult) => {
    const a = item.address;
    const street = a.road || a.pedestrian;
    const number = a.house_number;
    
    let mainText = "";
    
    if (street) {
        mainText = `${street} ${number || ''}`.trim();
    } else {
        // Fallback for places without a clear road name
        mainText = item.display_name.split(',')[0].trim();
    }
    
    // Construct Custom Subtext
    const parts: string[] = [];

    // 1. District / Locality
    // Prioritize Suburb > City District > Neighbourhood to avoid "Biadacz, Chorzów Batory" duplication
    const district = a.suburb || a.city_district || a.neighbourhood || a.quarter;
    const city = a.city || a.town || a.village || a.hamlet || a.municipality;

    // Only add district if it's different from city (avoid duplicates)
    if (district && district !== city) {
        parts.push(district);
    }
    
    // 2. City
    if (city) {
        parts.push(city);
    }

    // 3. State (Cleaned) - Remove "województwo"
    if (a.state) {
        parts.push(a.state.replace(/województwo/gi, '').trim());
    }

    // 4. County (Powiat) - Second to last group logic
    if (a.county) {
        parts.push(a.county);
    }

    // 5. Zip Code - "zara za powiatem"
    if (a.postcode) {
        parts.push(a.postcode);
    }

    // 6. Country - "kraj na koncu"
    if (a.country) {
        parts.push(a.country);
    }

    // Filter duplicates (e.g., if county == city) and empty strings
    const uniqueParts = parts.filter((p, i, self) => p && self.indexOf(p) === i);
    
    return { mainText, subText: uniqueParts.join(', ') };
  };

  const borderColor = color === 'blue' ? 'focus:border-blue-500' : 'focus:border-emerald-500';
  const iconColor = color === 'blue' ? 'text-blue-400 bg-blue-900/30' : 'text-emerald-400 bg-emerald-900/30';

  return (
    <div className="flex-1 w-full relative" ref={wrapperRef}>
      <div className="flex items-start gap-3">
        <div className={`mt-1 p-2 rounded-full ${iconColor}`}>
          <MapPin className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-bold">{label}</div>
            {/* Indicator if using location bias */}
            {(referencePoint || userLocation) && (
               <div title={referencePoint ? "Biased by Previous Point (~20km)" : "Biased by GPS (~20km)"} className="text-[10px] text-gray-600 flex items-center">
                 <Navigation className="w-3 h-3 mr-1" /> 
                 {referencePoint ? "Nearby" : "GPS"}
               </div>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={query}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              className={`w-full bg-gray-950 border border-gray-700 rounded-2xl py-2 pl-3 pr-10 text-white font-mono text-sm focus:outline-none ${borderColor} transition-colors`}
              placeholder="Type address..."
            />
            <div className="absolute right-3 top-2.5 text-gray-500">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </div>
          </div>
          <div className="text-sm text-gray-400 mt-1 truncate h-5">
            {value.city || 'Select location'}
          </div>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-2 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {suggestions.map((item) => {
            const { mainText, subText } = formatSuggestionDisplay(item);
            return (
              <button
                key={item.place_id}
                onClick={() => handleSelect(item)}
                className="w-full text-left px-4 py-3 hover:bg-gray-800 border-b border-gray-800 last:border-0 transition-colors flex flex-col gap-0.5 group"
              >
                <span className="text-sm font-bold text-gray-200 truncate w-full group-hover:text-white">
                  {mainText}
                </span>
                <span className="text-xs text-gray-500 truncate w-full group-hover:text-gray-400">
                  {subText}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AddressInput;
