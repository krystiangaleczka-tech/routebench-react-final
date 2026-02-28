

import { Stop, Coordinate, SolverConfig, DEFAULT_SOLVER_CONFIG, ScenarioConfig, DEFAULT_SCENARIO_CONFIG } from '../types';

// --- Distance & Cost Helpers ---

// Haversine formula for straight-line distance in KM (Fallback)
export const calculateDistance = (coord1: Coordinate, coord2: Coordinate): number => {
  const R = 6371; // Earth radius in km
  const dLat = (coord2.lat - coord1.lat) * (Math.PI / 180);
  const dLng = (coord2.lng - coord1.lng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1.lat * (Math.PI / 180)) *
      Math.cos(coord2.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Type for the cost function used by solvers
export type CostFunction = (a: Stop, b: Stop) => number;

export const defaultCostFunction: CostFunction = (a: Stop, b: Stop) => calculateDistance(a.coordinates, b.coordinates);

// Factory to create a cost function that reacts to scenarios
export const createScenarioCostFn = (baseFn: CostFunction, scenarios: ScenarioConfig): CostFunction => {
  return (a: Stop, b: Stop) => {
    let d = baseFn(a, b);

    // --- SCENARIO MODIFIERS ---

    // 1. Traffic: Add deterministic congestion to certain links based on coordinate hash
    // We use a predictable hash so 2-Opt doesn't get confused by random changing costs
    if (scenarios.traffic) {
      const hash = Math.abs(Math.sin(a.coordinates.lat * 1000 + b.coordinates.lng * 1000));
      if (hash > 0.7) { // 30% of roads are congested
         d *= 2.5; // Heavy traffic multiplier
      }
    }

    // 2. Weather Conditions (Global Multipliers)
    if (scenarios.rain) d *= 1.2;      // Slower driving
    if (scenarios.snow) d *= 1.6;      // Much slower
    if (scenarios.fog) d *= 1.3;       // Caution

    // 3. Time of Day
    if (scenarios.night) d *= 0.9;     // Faster (less traffic), assumes clear visibility

    // 4. Vehicle Type
    if (scenarios.truck) d *= 1.15;    // Trucks are slower/restricted
    if (scenarios.emergency) d *= 0.5; // Ambulance/Police (speeds, ignores some rules)

    // 5. VIP Logic (Simulated)
    // We arbitrarily designate addresses with length divisible by 7 as "VIP"
    // Reducing cost TO a VIP node makes algorithms eager to visit it
    if (scenarios.vip) {
       const isVip = b.address.length % 7 === 0;
       if (isVip) d *= 0.01; // "Magnet" effect
    }

    // 6. Environment Preference
    if (scenarios.highway) {
       // Prefer long jumps (simulating highways being faster per km)
       if (d > 5) d *= 0.7; 
    }

    if (scenarios.urban) {
       // Penalize short jumps (simulating city lights/intersections)
       if (d < 2) d *= 1.4;
    }

    return d;
  };
};

export const calculateTotalDistance = (route: Stop[], costFn: CostFunction = defaultCostFunction): number => {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += costFn(route[i], route[i + 1]);
  }
  return total;
};

// Calculate minutes based on scenarios
export const calculateDurationMinutes = (distanceKm: number, stopCount: number, scenarios: ScenarioConfig = DEFAULT_SCENARIO_CONFIG): number => {
  let avgSpeedKmH = 50; 
  let serviceTimeMinutes = 1.0;

  // Adjust parameters based on scenarios
  if (scenarios.traffic) avgSpeedKmH *= 0.6;
  if (scenarios.rain) { avgSpeedKmH *= 0.85; serviceTimeMinutes += 0.5; }
  if (scenarios.snow) { avgSpeedKmH *= 0.6; serviceTimeMinutes += 2.0; }
  if (scenarios.fog) avgSpeedKmH *= 0.8;
  if (scenarios.night) avgSpeedKmH *= 1.1; // Faster drive
  if (scenarios.truck) avgSpeedKmH *= 0.8;
  if (scenarios.emergency) avgSpeedKmH *= 1.5;
  if (scenarios.highway) avgSpeedKmH *= 1.2;
  if (scenarios.urban) avgSpeedKmH *= 0.7;

  const driveTimeMinutes = (distanceKm / avgSpeedKmH) * 60;
  const totalServiceTime = stopCount * serviceTimeMinutes;
  
  return Math.round(driveTimeMinutes + totalServiceTime);
};

// Estimate ETA based on Distance and Stop Count
export const calculateETA = (distanceKm: number, stopCount: number, scenarios: ScenarioConfig = DEFAULT_SCENARIO_CONFIG): string => {
  const totalMinutes = calculateDurationMinutes(distanceKm, stopCount, scenarios);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  
  return `${hours}h ${mins}m`;
};

// --- OSRM Integration ---

// 1. Fetch Matrix (Table service)
export const fetchOSRMMatrix = async (stops: Stop[]): Promise<number[][] | null> => {
  try {
    const coordinates = stops.map(s => `${s.coordinates.lng},${s.coordinates.lat}`).join(';');
    
    const url = `https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=distance`;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.code !== 'Ok' || !data.distances) return null;

    // Returns matrix in METERS. Convert to KM.
    const matrixKm = data.distances.map((row: number[]) => 
      row.map((distM: number) => distM / 1000)
    );
    
    return matrixKm;
  } catch (e) {
    console.warn("Failed to fetch OSRM Matrix", e);
    return null;
  }
};

// 2. Fetch Geometry (Route service)
export const fetchRoadData = async (route: Stop[]): Promise<{ distance: number, geometry: [number, number][] } | null> => {
  try {
    const coordinates = route.map(s => `${s.coordinates.lng},${s.coordinates.lat}`).join(';');
    
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`
    );

    if (!response.ok) {
      throw new Error('OSRM request failed');
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return null;
    }

    const osrmRoute = data.routes[0];
    
    // OSRM returns distance in meters
    const distanceKm = osrmRoute.distance / 1000;

    const geometry: [number, number][] = osrmRoute.geometry.coordinates.map(
      (coord: [number, number]) => [coord[1], coord[0]]
    );

    return { distance: distanceKm, geometry };

  } catch (error) {
    console.warn("Failed to fetch road data", error);
    return null;
  }
};

// --- Helper: Reusable Farthest Insertion Subtour Logic ---
const runFarthestInsertionSubtour = (
  start: Stop, 
  middlePoints: Stop[], 
  end: Stop,
  costFn: CostFunction
): Stop[] => {
  if (middlePoints.length === 0) return [start, end];
  
  let unvisited = [...middlePoints];
  let route = [start, end];

  while (unvisited.length > 0) {
    let farthestNodeIdx = -1;
    let maxMinDist = -1;

    for (let i = 0; i < unvisited.length; i++) {
      let minDistToRoute = Infinity;
      for (const rNode of route) {
        const d = costFn(unvisited[i], rNode);
        if (d < minDistToRoute) minDistToRoute = d;
      }
      
      if (minDistToRoute > maxMinDist) {
        maxMinDist = minDistToRoute;
        farthestNodeIdx = i;
      }
    }

    const nodeToInsert = unvisited[farthestNodeIdx];
    unvisited.splice(farthestNodeIdx, 1);

    let bestInsertIdx = -1;
    let minIncrease = Infinity;

    for (let i = 0; i < route.length - 1; i++) {
      const currentEdge = costFn(route[i], route[i+1]);
      const newEdges = costFn(route[i], nodeToInsert) + costFn(nodeToInsert, route[i+1]);
      const increase = newEdges - currentEdge;
      
      if (increase < minIncrease) {
        minIncrease = increase;
        bestInsertIdx = i + 1;
      }
    }
    route.splice(bestInsertIdx, 0, nodeToInsert);
  }
  return route;
};


// --- Algorithms ---

export const solveNearestNeighbor = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  const unvisited = new Set(stops);
  const route: Stop[] = [start];
  let current = start;

  while (unvisited.size > 0) {
    let nearest: Stop | null = null;
    let minDist = Infinity;

    for (const candidate of unvisited) {
      const dist = costFn(current, candidate);
      if (dist < minDist) {
        minDist = dist;
        nearest = candidate;
      }
    }

    if (nearest) {
      route.push(nearest);
      unvisited.delete(nearest);
      current = nearest;
    } else {
      break;
    }
  }

  route.push(end);
  return route;
};

export const solveTwoOpt = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  initialRoute?: Stop[],
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  let route = initialRoute ? [...initialRoute] : solveNearestNeighbor(start, stops, end, costFn, config);
  
  if (!config.enableLocalSearch) return route;

  let improved = true;
  const maxIterations = config.twoOptIterations;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    for (let i = 1; i < route.length - 2; i++) {
      for (let j = i + 1; j < route.length - 1; j++) {
        const d1 = costFn(route[i - 1], route[i]) + costFn(route[j], route[j + 1]);
        const d2 = costFn(route[i - 1], route[j]) + costFn(route[i], route[j + 1]);

        if (d2 < d1) {
          const newSegment = route.slice(i, j + 1).reverse();
          route.splice(i, newSegment.length, ...newSegment);
          improved = true;
        }
      }
    }
    iterations++;
  }
  return route;
};

export const solveThreeOpt = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  let route = solveTwoOpt(start, stops, end, undefined, costFn, config);
  
  if (!config.enableLocalSearch) return route;

  const maxIterations = config.threeOptIterations;
  const getDist = (r: Stop[]) => {
    let d = 0;
    for(let i=0; i<r.length-1; i++) d += costFn(r[i], r[i+1]);
    return d;
  };
  let bestDist = getDist(route);

  for (let iter = 0; iter < maxIterations; iter++) {
    const i = Math.floor(Math.random() * (route.length - 2)) + 1;
    const segmentLen = Math.floor(Math.random() * 3) + 1; 
    
    if (i + segmentLen >= route.length - 1) continue;

    const segment = route.slice(i, i + segmentLen);
    const remaining = [...route.slice(0, i), ...route.slice(i + segmentLen)];

    let bestInsertIndex = -1;
    let bestInsertDist = Infinity;

    for (let k = 0; k < 20; k++) {
       const j = Math.floor(Math.random() * (remaining.length - 1)) + 1;
       const prev = remaining[j-1];
       const next = remaining[j];
       const costRemoved = costFn(prev, next);
       const costAdded = costFn(prev, segment[0]) + costFn(segment[segment.length-1], next);
       
       if (costAdded - costRemoved < bestInsertDist) {
           const testRoute = [...remaining.slice(0, j), ...segment, ...remaining.slice(j)];
           const testD = getDist(testRoute);
           if (testD < bestDist) {
               bestDist = testD;
               bestInsertIndex = j;
               bestInsertDist = costAdded - costRemoved;
               route = testRoute;
           }
       }
    }
  }
  return route;
};

export const solveSimulatedAnnealing = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  let currentRoute = solveNearestNeighbor(start, stops, end, costFn, config);
  let bestRoute = [...currentRoute];
  
  const getDist = (r: Stop[]) => {
    let d = 0;
    for(let i=0; i<r.length-1; i++) d += costFn(r[i], r[i+1]);
    return d;
  };

  let currentDist = getDist(currentRoute);
  let bestDist = currentDist;

  let temp = config.saTemp;
  const coolingRate = config.saCooling;
  
  while (temp > 1) {
    const i = Math.floor(Math.random() * (currentRoute.length - 2)) + 1;
    const j = Math.floor(Math.random() * (currentRoute.length - 2)) + 1;
    
    if (i === j) continue;

    const newRoute = [...currentRoute];
    [newRoute[i], newRoute[j]] = [newRoute[j], newRoute[i]];
    
    const newDist = getDist(newRoute);
    
    if (newDist < currentDist || Math.random() < Math.exp((currentDist - newDist) / temp)) {
      currentRoute = newRoute;
      currentDist = newDist;
      
      if (currentDist < bestDist) {
        bestRoute = [...currentRoute];
        bestDist = currentDist;
      }
    }
    temp *= coolingRate;
  }
  return solveTwoOpt(start, [], end, bestRoute, costFn, config);
};

export const solveFarthestInsertion = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  return runFarthestInsertionSubtour(start, stops, end, costFn);
};

export const solveCheapestInsertion = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  const route = [start, end];
  const unvisited = [...stops];

  while (unvisited.length > 0) {
    let bestStopIndex = -1;
    let bestInsertIndex = -1;
    let minIncrease = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const candidate = unvisited[i];
      for (let j = 0; j < route.length - 1; j++) {
        const currentEdge = costFn(route[j], route[j+1]);
        const newEdges = costFn(route[j], candidate) + costFn(candidate, route[j+1]);
        const increase = newEdges - currentEdge;

        if (increase < minIncrease) {
          minIncrease = increase;
          bestStopIndex = i;
          bestInsertIndex = j + 1;
        }
      }
    }

    if (bestStopIndex !== -1) {
      const nodeToInsert = unvisited[bestStopIndex];
      unvisited.splice(bestStopIndex, 1);
      route.splice(bestInsertIndex, 0, nodeToInsert);
    } else {
      break; 
    }
  }
  return route;
};

// --- Helper: K-Means Clustering ---
const clusterStops = (stops: Stop[], K: number, costFn: CostFunction): {id: number, stops: Stop[], centroid: Coordinate}[] => {
    let centroids: Coordinate[] = [];
    // Initialization: Random Pick
    for (let k=0; k<K; k++) {
        if (stops[k]) centroids.push(stops[Math.floor(Math.random() * stops.length)].coordinates);
    }

    let clusters: Stop[][] = Array.from({ length: K }, () => []);
    
    // K-Means Iterations
    for (let iter=0; iter<25; iter++) {
        clusters = Array.from({ length: K }, () => []);
        stops.forEach(stop => {
            let nearestK = 0;
            let minD = Infinity;
            centroids.forEach((c, idx) => {
                const d = calculateDistance(stop.coordinates, c);
                if (d < minD) { minD = d; nearestK = idx; }
            });
            clusters[nearestK].push(stop);
        });

        centroids = clusters.map((cluster, idx) => {
            if (cluster.length === 0) return centroids[idx];
            return {
                lat: cluster.reduce((sum, s) => sum + s.coordinates.lat, 0) / cluster.length,
                lng: cluster.reduce((sum, s) => sum + s.coordinates.lng, 0) / cluster.length
            };
        });
    }

    return clusters.filter(c => c.length > 0).map((stops, i) => ({
        id: i,
        stops,
        centroid: {
            lat: stops.reduce((sum, s) => sum + s.coordinates.lat, 0) / stops.length,
            lng: stops.reduce((sum, s) => sum + s.coordinates.lng, 0) / stops.length
        }
    }));
};

export const solveClusterLine = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  if (stops.length === 0) return [start, end];

  const defaultK = Math.max(2, Math.ceil(Math.sqrt(stops.length / 2)));
  const K = (config.enableClustering && config.clusterCount > 0) ? config.clusterCount : defaultK;
  
  const validClusters = clusterStops(stops, K, costFn);

  const clusterStopsNodes: Stop[] = validClusters.map((vc, idx) => ({
    id: `cluster-${idx}`,
    address: 'Cluster',
    city: '',
    coordinates: vc.centroid
  }));
  
  const orderedClusterRoute = solveNearestNeighbor(start, clusterStopsNodes, end, costFn, config);
  
  const orderedClusters = orderedClusterRoute
    .slice(1, -1)
    .map(cs => validClusters.find(vc => calculateDistance(vc.centroid, cs.coordinates) < 0.001))
    .filter((c): c is typeof validClusters[0] => c !== undefined);

  let finalRoute: Stop[] = [start];

  orderedClusters.forEach((cluster, idx) => {
    const prevPoint = idx === 0 ? start.coordinates : orderedClusters[idx-1].centroid;
    const nextPoint = idx === orderedClusters.length - 1 ? end.coordinates : orderedClusters[idx+1].centroid;

    const vecX = nextPoint.lng - prevPoint.lng;
    const vecY = nextPoint.lat - prevPoint.lat;

    cluster.stops.sort((a, b) => {
      const projA = (a.coordinates.lng * vecX) + (a.coordinates.lat * vecY);
      const projB = (b.coordinates.lng * vecX) + (b.coordinates.lat * vecY);
      return projA - projB;
    });

    finalRoute.push(...cluster.stops);
  });

  finalRoute.push(end);
  return finalRoute;
};

export const solveClusterAnchor = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  if (stops.length === 0) return [start, end];

  const defaultK = Math.max(2, Math.ceil(Math.sqrt(stops.length / 2)));
  const K = (config.enableClustering && config.clusterCount > 0) ? config.clusterCount : defaultK;
  const validClusters = clusterStops(stops, K, costFn);

  const ANCHOR_TEXT = "Przyjaźni 168";
  const anchorStop = stops.find(s => s.address.includes(ANCHOR_TEXT));
  
  if (!anchorStop) return solveClusterLine(start, stops, end, costFn, config);

  const anchorClusterIndex = validClusters.findIndex(vc => vc.stops.some(s => s.id === anchorStop.id));
  
  if (anchorClusterIndex === -1) return solveClusterLine(start, stops, end, costFn, config);

  const anchorCluster = validClusters[anchorClusterIndex];
  const otherClusters = validClusters.filter((_, i) => i !== anchorClusterIndex);

  const otherClusterStops: Stop[] = otherClusters.map((vc, idx) => ({
    id: `cluster-other-${idx}`,
    address: 'Cluster',
    city: '',
    coordinates: vc.centroid
  }));

  const fakeStart: Stop = { ...start, coordinates: anchorCluster.centroid };
  const orderedRestRoute = solveNearestNeighbor(fakeStart, otherClusterStops, end, costFn, config);
  
  const orderedOtherClusters = orderedRestRoute
    .slice(1, -1) 
    .map(cs => otherClusters.find(vc => calculateDistance(vc.centroid, cs.coordinates) < 0.001))
    .filter((c): c is typeof validClusters[0] => c !== undefined);

  const finalClusterOrder = [anchorCluster, ...orderedOtherClusters];

  let finalRoute: Stop[] = [start];

  finalClusterOrder.forEach((cluster, idx) => {
    if (idx === 0) {
      const others = cluster.stops.filter(s => s.id !== anchorStop.id);
      const sortedOthers: Stop[] = [];
      
      if (others.length > 0) {
        const unvisited = new Set(others);
        let curr = anchorStop;
        while (unvisited.size > 0) {
          let next = null;
          let minD = Infinity;
          for (const c of unvisited) {
            const d = costFn(curr, c);
            if (d < minD) { minD = d; next = c; }
          }
          if (next) {
            sortedOthers.push(next);
            unvisited.delete(next);
            curr = next;
          } else { break; }
        }
      }
      finalRoute.push(anchorStop, ...sortedOthers);

    } else {
      const prevPoint = finalClusterOrder[idx-1].centroid; 
      const nextPoint = idx === finalClusterOrder.length - 1 ? end.coordinates : finalClusterOrder[idx+1].centroid;

      const vecX = nextPoint.lng - prevPoint.lng;
      const vecY = nextPoint.lat - prevPoint.lat;

      cluster.stops.sort((a, b) => {
        const projA = (a.coordinates.lng * vecX) + (a.coordinates.lat * vecY);
        const projB = (b.coordinates.lng * vecX) + (b.coordinates.lat * vecY);
        return projA - projB;
      });
      finalRoute.push(...cluster.stops);
    }
  });

  finalRoute.push(end);
  return finalRoute;
};

export const solveClusterFarthest = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  if (stops.length === 0) return [start, end];

  const defaultK = Math.max(4, Math.ceil(stops.length / 6));
  const K = (config.enableClustering && config.clusterCount > 0) ? config.clusterCount : defaultK;

  const validClusters = clusterStops(stops, K, costFn);

  const clusterStopsNodes: Stop[] = validClusters.map((vc, idx) => ({
    id: `cluster-${idx}`,
    address: 'Cluster',
    city: '',
    coordinates: vc.centroid
  }));
  
  const orderedClusterRoute = runFarthestInsertionSubtour(start, clusterStopsNodes, end, costFn);
  
  const orderedClusters = orderedClusterRoute
    .slice(1, -1)
    .map(cs => validClusters.find(vc => calculateDistance(vc.centroid, cs.coordinates) < 0.001))
    .filter((c): c is typeof validClusters[0] => c !== undefined);

  let finalRoute: Stop[] = [start];

  orderedClusters.forEach((cluster, idx) => {
    const entryNode: Stop = idx === 0 
        ? start 
        : { ...start, coordinates: orderedClusters[idx-1].centroid }; 
    
    const exitNode: Stop = idx === orderedClusters.length - 1 
        ? end 
        : { ...end, coordinates: orderedClusters[idx+1].centroid };

    const subRoute = runFarthestInsertionSubtour(entryNode, cluster.stops, exitNode, costFn);
    finalRoute.push(...subRoute.slice(1, -1));
  });

  finalRoute.push(end);
  return finalRoute;
};

export const solveClusterAnchorFarthest = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  if (stops.length === 0) return [start, end];

  const defaultK = Math.max(4, Math.ceil(stops.length / 6));
  const K = (config.enableClustering && config.clusterCount > 0) ? config.clusterCount : defaultK;
  
  const validClusters = clusterStops(stops, K, costFn);

  const ANCHOR_TEXT = "Przyjaźni 168";
  const anchorStop = stops.find(s => s.address.includes(ANCHOR_TEXT));
  
  if (!anchorStop) return solveClusterFarthest(start, stops, end, costFn, config);

  const anchorClusterIndex = validClusters.findIndex(vc => vc.stops.some(s => s.id === anchorStop.id));
  if (anchorClusterIndex === -1) return solveClusterFarthest(start, stops, end, costFn, config);

  const anchorCluster = validClusters[anchorClusterIndex];
  const otherClusters = validClusters.filter((_, i) => i !== anchorClusterIndex);

  const otherClusterStopsNodes: Stop[] = otherClusters.map((vc, idx) => ({
    id: `cluster-other-${idx}`,
    address: 'Cluster',
    city: '',
    coordinates: vc.centroid
  }));

  const fakeStart: Stop = { ...start, coordinates: anchorCluster.centroid };
  const orderedRestRoute = runFarthestInsertionSubtour(fakeStart, otherClusterStopsNodes, end, costFn);
  
  const orderedOtherClusters = orderedRestRoute
    .slice(1, -1) 
    .map(cs => otherClusters.find(vc => calculateDistance(vc.centroid, cs.coordinates) < 0.001))
    .filter((c): c is typeof validClusters[0] => c !== undefined);

  const finalClusterOrder = [anchorCluster, ...orderedOtherClusters];
  let finalRoute: Stop[] = [start];

  finalClusterOrder.forEach((cluster, idx) => {
    if (idx === 0) {
      const others = cluster.stops.filter(s => s.id !== anchorStop.id);
      const nextTarget = finalClusterOrder.length > 1 ? finalClusterOrder[1].centroid : end.coordinates;
      const exitNode: Stop = { ...end, coordinates: nextTarget };
      const subRoute = runFarthestInsertionSubtour(anchorStop, others, exitNode, costFn);
      finalRoute.push(...subRoute.slice(0, -1));
    } else {
      const entryNode: Stop = { ...start, coordinates: finalClusterOrder[idx-1].centroid };
      const exitNode: Stop = idx === finalClusterOrder.length - 1 
          ? end 
          : { ...end, coordinates: finalClusterOrder[idx+1].centroid };

      const subRoute = runFarthestInsertionSubtour(entryNode, cluster.stops, exitNode, costFn);
      finalRoute.push(...subRoute.slice(1, -1));
    }
  });

  finalRoute.push(end);
  return finalRoute;
};

export const solveMicroClusterProximity = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  if (stops.length === 0) return [start, end];

  // This algo heavily relies on cluster count tuning
  const defaultK = Math.max(2, Math.ceil(Math.sqrt(stops.length)));
  const K = (config.enableClustering && config.clusterCount > 0) ? config.clusterCount : defaultK;
  
  const validClusters = clusterStops(stops, K, costFn);

  const clusterNodes = validClusters.map((c, i) => ({
     id: `c-${i}`,
     coordinates: c.centroid,
     address: 'Cluster',
     city: ''
  }));
  
  const orderedClusterRoute = solveNearestNeighbor(start, clusterNodes, end, costFn, config);
  
  const orderedClusters = orderedClusterRoute.slice(1, -1).map(node => {
      return validClusters.find(c => calculateDistance(c.centroid, node.coordinates) < 0.0001);
  }).filter(c => c !== undefined) as typeof validClusters;

  const finalRoute = [start];
  let currentLoc = start;

  orderedClusters.forEach(cluster => {
     cluster.stops.sort((a, b) => {
         return costFn(currentLoc, a) - costFn(currentLoc, b);
     });
     
     finalRoute.push(...cluster.stops);
     currentLoc = cluster.stops[cluster.stops.length - 1];
  });

  finalRoute.push(end);
  return finalRoute;
};

export const solveFarthestStreetRepair = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  const route = solveFarthestInsertion(start, stops, end, costFn, config);

  // Repair is controlled by Clustering & Repair group
  if (!config.enableClustering) return route;

  const WINDOW_SIZE = config.repairWindow;
  const MAX_LOCAL_RADIUS_KM = 1.0; 

  const adjustedRoute = [...route];

  for (let i = 1; i <= adjustedRoute.length - 1 - WINDOW_SIZE; i++) {
     const entryNode = adjustedRoute[i-1];
     const windowIndices = Array.from({length: WINDOW_SIZE}, (_, k) => i + k);
     const windowNodes = windowIndices.map(idx => adjustedRoute[idx]);

     let isLocal = true;
     for (let j=0; j<windowNodes.length; j++) {
         for (let k=j+1; k<windowNodes.length; k++) {
             const d = costFn(windowNodes[j], windowNodes[k]);
             if (d > MAX_LOCAL_RADIUS_KM) {
                 isLocal = false;
                 break;
             }
         }
         if (!isLocal) break;
     }

     if (isLocal) {
         windowNodes.sort((a, b) => {
             const dA = costFn(entryNode, a);
             const dB = costFn(entryNode, b);
             return dA - dB;
         });

         windowNodes.forEach((node, idx) => {
             adjustedRoute[i + idx] = node;
         });
     }
  }

  return adjustedRoute;
};

export const solveFarthestDirectionalFlow = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  const route = solveFarthestInsertion(start, stops, end, costFn, config);

  // Uses repairWindow logic, so respect enableClustering
  if (!config.enableClustering) return route;

  const WINDOW_SIZE = config.repairWindow + 1; 
  const MAX_LOCAL_RADIUS_KM = 1.5; 

  const adjustedRoute = [...route];

  for (let i = 1; i <= adjustedRoute.length - 1 - WINDOW_SIZE; i++) {
     const entryNode = adjustedRoute[i-1];
     const exitNode = adjustedRoute[i + WINDOW_SIZE]; 
     
     const windowIndices = Array.from({length: WINDOW_SIZE}, (_, k) => i + k);
     const windowNodes = windowIndices.map(idx => adjustedRoute[idx]);

     let isLocal = true;
     for (let j=0; j<windowNodes.length; j++) {
         for (let k=j+1; k<windowNodes.length; k++) {
             const d = costFn(windowNodes[j], windowNodes[k]);
             if (d > MAX_LOCAL_RADIUS_KM) {
                 isLocal = false;
                 break;
             }
         }
         if (!isLocal) break;
     }

     if (isLocal) {
         const flowVecX = exitNode.coordinates.lng - entryNode.coordinates.lng;
         const flowVecY = exitNode.coordinates.lat - entryNode.coordinates.lat;
         
         windowNodes.sort((a, b) => {
             const projA = (a.coordinates.lng - entryNode.coordinates.lng) * flowVecX + 
                           (a.coordinates.lat - entryNode.coordinates.lat) * flowVecY;
             
             const projB = (b.coordinates.lng - entryNode.coordinates.lng) * flowVecX + 
                           (b.coordinates.lat - entryNode.coordinates.lat) * flowVecY;
             
             return projA - projB;
         });

         windowNodes.forEach((node, idx) => {
             adjustedRoute[i + idx] = node;
         });
     }
  }
  
  return adjustedRoute;
};

export const solveCheapestDirectionalFlow = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  const route = solveCheapestInsertion(start, stops, end, costFn, config);

  // Uses repairWindow logic
  if (!config.enableClustering) return route;

  const WINDOW_SIZE = config.repairWindow + 1;
  const MAX_LOCAL_RADIUS_KM = 1.5; 

  const adjustedRoute = [...route];

  for (let i = 1; i <= adjustedRoute.length - 1 - WINDOW_SIZE; i++) {
     const entryNode = adjustedRoute[i-1];
     const exitNode = adjustedRoute[i + WINDOW_SIZE]; 
     
     const windowIndices = Array.from({length: WINDOW_SIZE}, (_, k) => i + k);
     const windowNodes = windowIndices.map(idx => adjustedRoute[idx]);

     let isLocal = true;
     for (let j=0; j<windowNodes.length; j++) {
         for (let k=j+1; k<windowNodes.length; k++) {
             const d = costFn(windowNodes[j], windowNodes[k]);
             if (d > MAX_LOCAL_RADIUS_KM) {
                 isLocal = false;
                 break;
             }
         }
         if (!isLocal) break;
     }

     if (isLocal) {
         const flowVecX = exitNode.coordinates.lng - entryNode.coordinates.lng;
         const flowVecY = exitNode.coordinates.lat - entryNode.coordinates.lat;
         
         windowNodes.sort((a, b) => {
             const projA = (a.coordinates.lng - entryNode.coordinates.lng) * flowVecX + 
                           (a.coordinates.lat - entryNode.coordinates.lat) * flowVecY;
             const projB = (b.coordinates.lng - entryNode.coordinates.lng) * flowVecX + 
                           (b.coordinates.lat - entryNode.coordinates.lat) * flowVecY;
             return projA - projB;
         });

         windowNodes.forEach((node, idx) => {
             adjustedRoute[i + idx] = node;
         });
     }
  }
  
  return adjustedRoute;
};

// --- NEW ALGORITHMS (16 - 21) ---

// 16. Clarke & Wright Savings
export const solveClarkeWright = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  const savings: { i: number; j: number; save: number }[] = [];
  
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const distI = costFn(start, stops[i]);
      const distJ = costFn(start, stops[j]);
      const distIJ = costFn(stops[i], stops[j]);
      const save = distI + distJ - distIJ;
      if (save > 0) {
        savings.push({ i, j, save });
      }
    }
  }
  savings.sort((a, b) => b.save - a.save);

  const chains: Stop[][] = stops.map(s => [s]);
  
  for (const { i, j } of savings) {
    const stopA = stops[i];
    const stopB = stops[j];
    
    const chainAIdx = chains.findIndex(c => c.includes(stopA));
    const chainBIdx = chains.findIndex(c => c.includes(stopB));

    if (chainAIdx !== chainBIdx && chainAIdx !== -1 && chainBIdx !== -1) {
        const chainA = chains[chainAIdx];
        const chainB = chains[chainBIdx];

        const isAStart = chainA[0] === stopA;
        const isAEnd = chainA[chainA.length-1] === stopA;
        const isBStart = chainB[0] === stopB;
        const isBEnd = chainB[chainB.length-1] === stopB;

        if (isAEnd && isBStart) {
            chainA.push(...chainB);
            chains.splice(chainBIdx, 1);
        } else if (isBEnd && isAStart) {
            chainB.push(...chainA);
            chains.splice(chainAIdx, 1);
        } else if (isAStart && isBStart) {
            chainA.reverse();
            chainA.push(...chainB);
            chains.splice(chainBIdx, 1);
        } else if (isAEnd && isBEnd) {
            chainB.reverse();
            chainA.push(...chainB);
            chains.splice(chainBIdx, 1);
        }
    }
  }
  
  const finalChain = chains.reduce((acc, c) => [...acc, ...c], []);
  return [start, ...finalChain, end];
};

// 17. Sweep Algorithm
export const solveSweep = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  const centerLat = stops.reduce((s, n) => s + n.coordinates.lat, 0) / stops.length;
  const centerLng = stops.reduce((s, n) => s + n.coordinates.lng, 0) / stops.length;

  const sorted = [...stops].sort((a, b) => {
    const angA = Math.atan2(a.coordinates.lat - centerLat, a.coordinates.lng - centerLng);
    const angB = Math.atan2(b.coordinates.lat - centerLat, b.coordinates.lng - centerLng);
    return angA - angB;
  });

  return [start, ...sorted, end];
};

// 18. Hilbert Curve
const rot = (n: number, x: number, y: number, rx: number, ry: number): [number, number] => {
  if (ry === 0) {
    if (rx === 1) {
      x = n - 1 - x;
      y = n - 1 - y;
    }
    return [y, x];
  }
  return [x, y];
};

const xy2d = (n: number, x: number, y: number): number => {
  let rx, ry, s, d = 0;
  for (s = n / 2; s > 0; s /= 2) {
    rx = (x & s) > 0 ? 1 : 0;
    ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    [x, y] = rot(s, x, y, rx, ry);
  }
  return d;
};

export const solveHilbert = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  const lats = stops.map(s => s.coordinates.lat);
  const lngs = stops.map(s => s.coordinates.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  
  const N = 65536; // 2^16
  
  const stopsWithIdx = stops.map(s => {
    const x = Math.floor(((s.coordinates.lng - minLng) / (maxLng - minLng)) * (N - 1));
    const y = Math.floor(((s.coordinates.lat - minLat) / (maxLat - minLat)) * (N - 1));
    return { stop: s, hIdx: xy2d(N, x, y) };
  });

  stopsWithIdx.sort((a, b) => a.hIdx - b.hIdx);
  return [start, ...stopsWithIdx.map(s => s.stop), end];
};

// 19. Convex Hull Insertion
const crossProduct = (o: Coordinate, a: Coordinate, b: Coordinate) => {
  return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
};

const getConvexHull = (points: Stop[]): Stop[] => {
   if (points.length <= 3) return points;
   const sorted = [...points].sort((a, b) => a.coordinates.lng - b.coordinates.lng || a.coordinates.lat - b.coordinates.lat);
   
   const lower: Stop[] = [];
   for (const p of sorted) {
     while (lower.length >= 2 && crossProduct(lower[lower.length-2].coordinates, lower[lower.length-1].coordinates, p.coordinates) <= 0) {
       lower.pop();
     }
     lower.push(p);
   }
   
   const upper: Stop[] = [];
   for (let i = sorted.length - 1; i >= 0; i--) {
     const p = sorted[i];
     while (upper.length >= 2 && crossProduct(upper[upper.length-2].coordinates, upper[upper.length-1].coordinates, p.coordinates) <= 0) {
       upper.pop();
     }
     upper.push(p);
   }
   
   lower.pop();
   upper.pop();
   return [...lower, ...upper];
};

export const solveConvexHull = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  const hull = getConvexHull(stops);
  const hullSet = new Set(hull);
  const innerPoints = stops.filter(s => !hullSet.has(s));

  const route = [start, ...hull, end];
  
  let unvisited = [...innerPoints];
  while (unvisited.length > 0) {
     let bestStopIdx = -1;
     let bestInsertIdx = -1;
     let minCost = Infinity;

     for(let i=0; i<unvisited.length; i++) {
       for(let j=0; j<route.length-1; j++) {
          const added = costFn(route[j], unvisited[i]) + costFn(unvisited[i], route[j+1]) - costFn(route[j], route[j+1]);
          if (added < minCost) {
             minCost = added;
             bestStopIdx = i;
             bestInsertIdx = j+1;
          }
       }
     }
     
     if (bestStopIdx !== -1) {
         route.splice(bestInsertIdx, 0, unvisited[bestStopIdx]);
         unvisited.splice(bestStopIdx, 1);
     } else break;
  }
  
  return route;
};

// 20. Genetic Algorithm (Simple)
export const solveGenetic = (
  start: Stop,
  stops: Stop[],
  end: Stop,
  costFn: CostFunction = defaultCostFunction,
  config: SolverConfig = DEFAULT_SOLVER_CONFIG
): Stop[] => {
  if (!config.enableGenetic) return solveNearestNeighbor(start, stops, end, costFn, config);

  const POP_SIZE = config.gaPopulation;
  const GENERATIONS = config.gaGenerations;
  const MUTATION_RATE = config.gaMutationRate;
  const ELITISM_RATE = config.gaElitism;
  
  let population: Stop[][] = [];
  
  for (let i=0; i<POP_SIZE; i++) {
    const perm = [...stops];
    for (let k = perm.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [perm[k], perm[j]] = [perm[j], perm[k]];
    }
    population.push(perm);
  }

  const fitness = (path: Stop[]) => 1 / calculateTotalDistance([start, ...path, end], costFn);

  for (let gen=0; gen<GENERATIONS; gen++) {
     population.sort((a, b) => fitness(b) - fitness(a));
     const nextGen = population.slice(0, Math.floor(POP_SIZE * ELITISM_RATE)); // Elitism based on config

     while (nextGen.length < POP_SIZE) {
        const p1 = population[Math.floor(Math.random() * (POP_SIZE * 0.5))]; 
        const p2 = population[Math.floor(Math.random() * (POP_SIZE * 0.5))];

        const startIdx = Math.floor(Math.random() * p1.length);
        const endIdx = Math.floor(Math.random() * (p1.length - startIdx)) + startIdx;
        
        const child = Array(p1.length).fill(null);
        const childSet = new Set();
        
        for(let i=startIdx; i<=endIdx; i++) {
           child[i] = p1[i];
           childSet.add(p1[i].id);
        }
        
        let p2Idx = 0;
        for(let i=0; i<child.length; i++) {
           if (child[i] === null) {
              while(childSet.has(p2[p2Idx].id)) p2Idx++;
              child[i] = p2[p2Idx];
              childSet.add(p2[p2Idx].id);
           }
        }
        
        if (Math.random() < MUTATION_RATE) {
           const i = Math.floor(Math.random() * child.length);
           const j = Math.floor(Math.random() * child.length);
           [child[i], child[j]] = [child[j], child[i]];
        }
        nextGen.push(child);
     }
     population = nextGen;
  }
  
  population.sort((a, b) => fitness(b) - fitness(a));
  return [start, ...population[0], end];
};