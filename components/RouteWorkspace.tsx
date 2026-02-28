

import React, { useState, useEffect, useRef } from 'react';
import { ArrowRightLeft, Play, Loader2, FileUp, FileDown } from 'lucide-react';
import MapPanel from './MapPanel';
import TunerPanel from './TunerPanel';
import AddressInput from './AddressInput';
import { DEFAULT_START, DEFAULT_END, RAW_STOPS_DATA } from '../constants';
import { 
  solveTwoOpt, 
  solveThreeOpt,
  solveSimulatedAnnealing,
  solveFarthestInsertion,
  solveClusterAnchorFarthest,
  solveFarthestStreetRepair,
  solveFarthestDirectionalFlow,
  solveCheapestInsertion,
  solveClarkeWright,
  solveHilbert,
  solveConvexHull,
  calculateTotalDistance, 
  calculateETA,
  calculateDurationMinutes,
  fetchRoadData,
  fetchOSRMMatrix,
  calculateDistance,
  createScenarioCostFn,
  CostFunction
} from '../services/solverService';
import { parseImportedData } from '../services/importService';
import { Stop, RouteResult, AlgorithmType, SolverConfig, DEFAULT_SOLVER_CONFIG, ScenarioConfig, DEFAULT_SCENARIO_CONFIG } from '../types';

interface RouteWorkspaceProps {
  workspaceId: number;
  isActive: boolean;
}

const RouteWorkspace: React.FC<RouteWorkspaceProps> = ({ workspaceId, isActive }) => {
  const [startPoint, setStartPoint] = useState<Stop>(DEFAULT_START);
  const [endPoint, setEndPoint] = useState<Stop>(DEFAULT_END);
  const [stops, setStops] = useState<Stop[]>(workspaceId === 0 ? RAW_STOPS_DATA : []); // Only load default data for first tab
  const [status, setStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [solverConfig, setSolverConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG);
  const [scenarioConfig, setScenarioConfig] = useState<ScenarioConfig>(DEFAULT_SCENARIO_CONFIG);
  
  const [results, setResults] = useState<Record<string, RouteResult | null>>({});
  const [previousResults, setPreviousResults] = useState<Record<string, RouteResult | null>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const algoKeys = [
    { key: 'original', type: AlgorithmType.ORIGINAL, fn: (s: Stop, m: Stop[], e: Stop, cf: CostFunction, c: SolverConfig) => [s, ...m, e] },
    { key: 'twoOpt', type: AlgorithmType.TWO_OPT, fn: (s: Stop, m: Stop[], e: Stop, cf: CostFunction, c: SolverConfig) => solveTwoOpt(s, m, e, undefined, cf, c) },
    { key: 'farthest', type: AlgorithmType.FARTHEST_INSERTION, fn: solveFarthestInsertion },
    { key: 'threeOpt', type: AlgorithmType.THREE_OPT, fn: solveThreeOpt },
    { key: 'sa', type: AlgorithmType.SIMULATED_ANNEALING, fn: solveSimulatedAnnealing },
    { key: 'clusterAnchorFarthest', type: AlgorithmType.CLUSTER_ANCHOR_FARTHEST, fn: solveClusterAnchorFarthest },
    { key: 'farthestStreetRepair', type: AlgorithmType.FARTHEST_STREET_REPAIR, fn: solveFarthestStreetRepair },
    { key: 'farthestDirectional', type: AlgorithmType.FARTHEST_DIRECTIONAL_FLOW, fn: solveFarthestDirectionalFlow },
    { key: 'cheapestInsertion', type: AlgorithmType.CHEAPEST_INSERTION, fn: solveCheapestInsertion },
    { key: 'clarkeWright', type: AlgorithmType.CLARKE_WRIGHT, fn: solveClarkeWright },
    { key: 'hilbert', type: AlgorithmType.HILBERT, fn: solveHilbert },
    { key: 'convexHull', type: AlgorithmType.CONVEX_HULL, fn: solveConvexHull },
  ];

  const swapEndpoints = () => {
    setStartPoint(endPoint);
    setEndPoint(startPoint);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleRatingChange = (key: string, value: number) => {
    setRatings(prev => ({
        ...prev,
        [key]: value
    }));
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        setStatus('Importing data...');
        const importedStops = await parseImportedData(file);
        setStops(importedStops);
        setStatus(`Imported ${importedStops.length} stops successfully.`);
        
        // Clear status after 3 seconds
        setTimeout(() => setStatus(''), 3000);
      } catch (error) {
        console.error(error);
        setStatus('Failed to import file. Ensure CSV format.');
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportCSV = () => {
    const validResults = Object.values(results).filter((r): r is RouteResult => r !== null);
    
    if (validResults.length === 0) {
      setStatus('Brak wyników do eksportu.');
      setTimeout(() => setStatus(''), 2000);
      return;
    }

    // 1. Prepare Scenario String
    const activeScenarios = (Object.entries(scenarioConfig) as [keyof ScenarioConfig, boolean][])
      .filter(([_, isActive]) => isActive)
      .map(([key]) => key)
      .join(' + ');
    
    const scenarioString = activeScenarios || 'Standard';

    // 2. Determine Best Distance (Baseline for Score)
    const minDistance = Math.min(...validResults.map(r => r.stats.distanceKm));

    // 3. Build CSV
    // Headers: nazwa algorytmu, dystans, calc, eta, ocena, sceneria
    const headers = ['Nazwa Algorytmu', 'Dystans (km)', 'Calc (ms)', 'ETA', 'Ocena Auto (1-10)', 'Ocena Manualna', 'Sceneria'];
    
    const rows = validResults.map(r => {
      // Score Calculation: (Best Dist / This Dist) * 10.
      const autoScore = (minDistance / r.stats.distanceKm) * 10;
      
      // Find key for this result to get manual rating
      const key = algoKeys.find(k => k.type === r.stats.algorithmName)?.key || '';
      const manualRating = ratings[key] || '';

      return [
        `"${r.stats.algorithmName}"`,
        r.stats.distanceKm.toFixed(3).replace('.', ','), // Excel in PL often uses comma
        r.stats.calculationTimeMs.toFixed(0),
        `"${r.stats.eta}"`,
        autoScore.toFixed(2).replace('.', ','),
        manualRating,
        `"${scenarioString}"`
      ].join(';'); // Semicolon delimiter for better compatibility in EU regions
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n'); // Add BOM for Excel UTF-8
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `routebench_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const createResult = (path: Stop[], name: string, timeMs: number, distance: number): RouteResult => {
    return {
      path,
      stats: {
        algorithmName: name,
        distanceKm: distance,
        calculationTimeMs: timeMs,
        isRoadData: false,
        eta: calculateETA(distance, path.length, scenarioConfig),
        durationMinutes: calculateDurationMinutes(distance, path.length, scenarioConfig)
      }
    };
  };

  const runBenchmarks = async () => {
    setIsProcessing(true);
    setStatus('Fetching OSRM Distance Matrix...');
    
    // Store current results as previous results before overwriting
    if (Object.keys(results).length > 0) {
        setPreviousResults(results);
    }

    const allStops = [startPoint, ...stops, endPoint];
    const uniqueStopsMap = new Map<string, number>();
    const uniqueStopsList: Stop[] = [];
    
    allStops.forEach(s => {
      if (!uniqueStopsMap.has(s.id)) {
        uniqueStopsMap.set(s.id, uniqueStopsList.length);
        uniqueStopsList.push(s);
      }
    });

    let costMatrix: number[][] | null = null;
    try {
       costMatrix = await fetchOSRMMatrix(uniqueStopsList);
    } catch (e) {
       console.warn("Matrix fetch failed, falling back to Haversine");
    }

    const baseCostFn: CostFunction = (a, b) => {
      if (costMatrix) {
        const idxA = uniqueStopsMap.get(a.id);
        const idxB = uniqueStopsMap.get(b.id);
        if (idxA !== undefined && idxB !== undefined) {
          return costMatrix[idxA][idxB];
        }
      }
      return calculateDistance(a.coordinates, b.coordinates);
    };

    const scenarioCostFn = createScenarioCostFn(baseCostFn, scenarioConfig);

    setStatus('Running Algorithms...');
    const tempResults: any = {};

    for (const algo of algoKeys) {
      const t0 = performance.now();
      const path = algo.fn(startPoint, stops, endPoint, scenarioCostFn, solverConfig);
      const t1 = performance.now();
      
      const realDistance = calculateTotalDistance(path, baseCostFn);
      tempResults[algo.key] = createResult(path, algo.type, t1 - t0, realDistance);
    }

    setResults(tempResults);

    setStatus('Fetching Road Geometries...');
    
    const pathSignatureToGeom = new Map<string, {distance: number, geometry: [number, number][]} | null>();
    const keys = Object.keys(tempResults);
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const result = tempResults[key];
      if (!result) continue;

      const signature = result.path.map((s: Stop) => s.id).join('|');
      let roadData = pathSignatureToGeom.get(signature);

      if (roadData === undefined) {
        setStatus(`Fetching Geometry ${i+1}/${keys.length}...`);
        try {
          roadData = await fetchRoadData(result.path);
          pathSignatureToGeom.set(signature, roadData);
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (e) {
          pathSignatureToGeom.set(signature, null);
        }
      }

      if (roadData) {
        setResults(prev => ({
          ...prev,
          [key]: {
            ...prev[key]!,
            geometry: roadData!.geometry,
            stats: {
              ...prev[key]!.stats,
              distanceKm: roadData!.distance,
              isRoadData: true,
              eta: calculateETA(roadData!.distance, result.path.length, scenarioConfig),
              durationMinutes: calculateDurationMinutes(roadData!.distance, result.path.length, scenarioConfig)
            }
          }
        }));
      }
    }

    setStatus('');
    setIsProcessing(false);
  };

  // Initial auto-run only for the first workspace if it has data
  useEffect(() => {
    if (workspaceId === 0 && stops.length > 0 && Object.keys(results).length === 0) {
      runBenchmarks();
    }
  }, []); 

  return (
    <div className="p-4 lg:p-8 font-sans fade-in">
      {/* Header & Controls */}
      <div className="max-w-7xl mx-auto mb-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              RouteBench Studio
            </h1>
            <p className="text-gray-500 mt-1 text-sm md:text-base flex items-center gap-2">
              Workspace #{workspaceId + 1}: {stops.length} Stops Loaded
              {status && <span className="flex items-center text-blue-400 text-xs animate-pulse ml-2"><Loader2 className="w-3 h-3 mr-1 animate-spin"/> {status}</span>}
            </p>
          </div>
          
          <div className="flex gap-2">
             <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv,.txt"
                className="hidden"
             />
             <button 
                onClick={handleImportClick}
                disabled={isProcessing}
                className="flex items-center justify-center px-4 py-3 text-gray-400 font-medium rounded-2xl bg-gray-800/50 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition-all duration-200"
                title="Import CSV (Lat, Lng, Address)"
              >
                <FileUp className="w-5 h-5 mr-2" />
                Import
              </button>

              <button 
                onClick={handleExportCSV}
                disabled={Object.keys(results).length === 0 || isProcessing}
                className={`flex items-center justify-center px-4 py-3 font-medium rounded-2xl border transition-all duration-200 ${Object.keys(results).length === 0 ? 'text-gray-600 bg-gray-900 border-gray-800 cursor-not-allowed' : 'text-emerald-400 bg-emerald-900/20 border-emerald-900/50 hover:bg-emerald-900/40'}`}
                title="Export Results to CSV"
              >
                <FileDown className="w-5 h-5 mr-2" />
                Export CSV
              </button>

              <button 
                onClick={runBenchmarks}
                disabled={isProcessing}
                className={`flex items-center justify-center px-8 py-3 text-white font-semibold rounded-2xl shadow-lg transition-all duration-200 ${isProcessing ? 'bg-gray-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-blue-900/30'}`}
              >
                {isProcessing ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Play className="w-5 h-5 mr-2 fill-current" />}
                {isProcessing ? 'Running...' : 'Run Benchmark'}
              </button>
          </div>
        </div>

        {/* Configuration Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-[2rem] p-6 lg:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-500 to-emerald-500"></div>
          
          <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
            
            <AddressInput 
               label="Start Point"
               value={startPoint}
               onChange={setStartPoint}
               color="blue"
            />

            <button 
              onClick={swapEndpoints}
              className="p-4 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 hover:border-gray-600 transition-colors shrink-0 shadow-lg"
              title="Swap Start & End"
            >
              <ArrowRightLeft className="w-6 h-6" />
            </button>

            <AddressInput 
               label="End Point"
               value={endPoint}
               onChange={setEndPoint}
               color="emerald"
               referencePoint={startPoint.coordinates}
            />

          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto">
        <TunerPanel 
          config={solverConfig} setConfig={setSolverConfig} 
          scenarios={scenarioConfig} setScenarios={setScenarioConfig}
        />
      </div>

      {/* Comparison Grid */}
      <div className="max-w-[1800px] mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 auto-rows-[400px]">
        
        {algoKeys.map(({ key, type: title }, index) => {
            const result = results[key];
            const prev = previousResults[key];
            const colors = ['red', 'emerald', 'pink', 'purple', 'orange', 'teal', 'violet', 'lime', 'amber', 'zinc', 'stone', 'neutral'];
            const color = colors[index % colors.length];

            if (!result) return null;

            return (
                <MapPanel 
                    key={key}
                    title={`${index + 1}. ${title}`} 
                    result={result} 
                    color={color}
                    previousStats={prev?.stats}
                    rating={ratings[key]}
                    onRate={(val) => handleRatingChange(key, val)}
                />
            );
        })}

      </div>
    </div>
  );
};

export default RouteWorkspace;