

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Stop {
  id: string;
  address: string;
  city: string;
  coordinates: Coordinate;
  notes?: string;
}

export interface ScenarioConfig {
  traffic: boolean;
  rain: boolean;
  snow: boolean;
  fog: boolean;
  night: boolean;
  vip: boolean;
  truck: boolean;
  highway: boolean;
  urban: boolean;
  emergency: boolean;
}

export const DEFAULT_SCENARIO_CONFIG: ScenarioConfig = {
  traffic: false,
  rain: false,
  snow: false,
  fog: false,
  night: false,
  vip: false,
  truck: false,
  highway: false,
  urban: false,
  emergency: false,
};

export interface SolverConfig {
  // Clustering & Repair Group
  enableClustering: boolean;
  clusterCount: number; 
  repairWindow: number; 
  
  // Local Search Group
  enableLocalSearch: boolean;
  twoOptIterations: number;
  threeOptIterations: number;
  
  // Simulated Annealing (No UI Toggle currently)
  saTemp: number;
  saCooling: number;
  
  // Genetic Algorithm Group
  enableGenetic: boolean;
  gaPopulation: number;
  gaGenerations: number;
  gaMutationRate: number;
  gaElitism: number;
  
  // U-Turn Tuning Group
  enableUTurn: boolean;
  uTurnAlternativeDist: number; // Meters added if avoiding U-turn (detour)
  uTurnReward: number; // Algorithm preference/reward for U-turns
}

export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  enableClustering: false,
  clusterCount: 20,
  enableLocalSearch: false,
  twoOptIterations: 200,
  threeOptIterations: 3000,
  repairWindow: 3,
  saTemp: 1000,
  saCooling: 0.995,
  enableGenetic: false,
  gaPopulation: 50,
  gaGenerations: 100,
  gaMutationRate: 0.1,
  gaElitism: 0.2,
  enableUTurn: false,
  uTurnAlternativeDist: 150, // 150m detour default
  uTurnReward: 10 // Moderate reward
};

export interface RouteStats {
  distanceKm: number;
  calculationTimeMs: number;
  algorithmName: string;
  isRoadData?: boolean; 
  eta?: string; 
  durationMinutes?: number;
}

export interface RouteResult {
  path: Stop[];
  stats: RouteStats;
  geometry?: [number, number][]; 
}

export enum AlgorithmType {
  ORIGINAL = 'Original Order',
  NEAREST_NEIGHBOR = 'Nearest Neighbor',
  TWO_OPT = 'NN + 2-Opt (VROOM Sim)',
  THREE_OPT = 'NN + 3-Opt (Deep Search)',
  SIMULATED_ANNEALING = 'Simulated Annealing',
  FARTHEST_INSERTION = 'Farthest Insertion',
  CLUSTER_LINE = 'Cluster & Linear Sweep',
  CLUSTER_ANCHOR = 'Cluster & Anchor Priority',
  CLUSTER_FARTHEST = 'Cluster & Farthest (High-Res)',
  CLUSTER_ANCHOR_FARTHEST = 'Cluster, Anchor & Farthest',
  MICRO_CLUSTER_PROXIMITY = 'Micro-Cluster & Proximity',
  FARTHEST_STREET_REPAIR = 'Farthest + Street Repair',
  FARTHEST_DIRECTIONAL_FLOW = 'Farthest + Directional Flow',
  CHEAPEST_INSERTION = 'Cheapest Insertion (On-The-Way)',
  CHEAPEST_DIRECTIONAL_FLOW = 'Cheapest + Directional Flow',
  CLARKE_WRIGHT = 'Clarke & Wright Savings',
  SWEEP = 'Sweep Algorithm',
  HILBERT = 'Hilbert Space-Filling Curve',
  CONVEX_HULL = 'Convex Hull Insertion',
  GENETIC = 'Genetic Algorithm'
}