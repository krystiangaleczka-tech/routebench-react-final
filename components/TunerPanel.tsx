
import React, { useState } from 'react';
import { Settings2, Sliders, Zap, FlaskConical, Activity, RotateCw, ChevronDown, ChevronUp } from 'lucide-react';
import { SolverConfig, ScenarioConfig } from '../types';

interface TunerPanelProps {
  config: SolverConfig;
  setConfig: (c: SolverConfig) => void;
  scenarios: ScenarioConfig;
  setScenarios: (s: ScenarioConfig) => void;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  color: string;
  lowInfo: string;
  highInfo: string;
  isFloat?: boolean;
  disabled?: boolean;
}

const SliderWithInfo: React.FC<SliderProps> = ({ 
  label, value, min, max, step, onChange, color, lowInfo, highInfo, isFloat, disabled 
}) => (
  <div className={`mb-4 transition-opacity duration-300 ${disabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
    <label className="flex justify-between text-xs text-gray-400 mb-1">
      <span className="font-medium text-gray-300">{label}</span>
      <span className="font-mono text-white">{isFloat ? value.toFixed(2) : value}</span>
    </label>
    <input 
      type="range" min={min} max={max} step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(isFloat ? parseFloat(e.target.value) : parseInt(e.target.value))}
      className={`w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-${color}-500 hover:bg-gray-600 transition-colors`}
    />
    <div className="flex justify-between text-[10px] text-gray-500 mt-1 leading-tight">
      <span className="max-w-[45%]">▼ {lowInfo}</span>
      <span className="max-w-[45%] text-right">▲ {highInfo}</span>
    </div>
  </div>
);

interface ToggleHeaderProps {
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (val: boolean) => void;
  colorClass: string;
}

const ToggleHeader: React.FC<ToggleHeaderProps> = ({ label, icon, checked, onChange, colorClass }) => (
  <div className={`flex items-center justify-between mb-4 ${colorClass}`}>
    <div className="flex items-center gap-2 text-sm font-semibold">
      {icon} {label}
    </div>
    <label className="relative inline-flex items-center cursor-pointer">
      <input 
        type="checkbox" 
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer" 
      />
      <div className="w-10 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
    </label>
  </div>
);

const TunerPanel: React.FC<TunerPanelProps> = ({ config, setConfig, scenarios, setScenarios }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  // Generic handler for number values
  const handleChange = (key: keyof SolverConfig, value: number) => {
    setConfig({ ...config, [key]: value });
  };

  // Generic handler for boolean flags
  const handleToggle = (key: keyof SolverConfig, value: boolean) => {
    setConfig({ ...config, [key]: value });
  };

  const toggleScenario = (key: keyof ScenarioConfig) => {
    setScenarios({ ...scenarios, [key]: !scenarios[key] });
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-[2.5rem] shadow-2xl mb-8 overflow-hidden transition-all duration-300">
      {/* Header - Clickable to toggle */}
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between p-6 md:p-8 cursor-pointer hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3 text-blue-400">
          <div className="p-2 bg-blue-900/20 rounded-2xl">
             <Settings2 className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold uppercase tracking-wider">Algorithm Tuner</h3>
        </div>
        <div className="text-gray-500 hover:text-gray-300 transition-colors p-2 bg-gray-800/50 rounded-full">
          {isCollapsed ? <ChevronDown className="w-6 h-6" /> : <ChevronUp className="w-6 h-6" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-6 md:p-8 pt-0 border-t border-gray-800/50 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-8 animate-in slide-in-from-top-4 duration-300 fade-in">
          
          {/* Clustering & Repair Group */}
          <div className="space-y-2 border-l-2 border-blue-900/50 pl-6 mt-4">
            <ToggleHeader 
              label="Clustering & Repair" 
              icon={<Sliders className="w-3 h-3" />}
              checked={config.enableClustering}
              onChange={(v) => handleToggle('enableClustering', v)}
              colorClass="text-blue-200"
            />
            
            <SliderWithInfo 
              label="Cluster Count (K)"
              value={config.clusterCount} min={2} max={50} step={1}
              onChange={(v) => handleChange('clusterCount', v)}
              color="blue"
              lowInfo="Większe obszary, mniej grup"
              highInfo="Więcej małych grup, precyzyjnie"
              disabled={!config.enableClustering}
            />

            <SliderWithInfo 
              label="Repair Window Size"
              value={config.repairWindow} min={2} max={12} step={1}
              onChange={(v) => handleChange('repairWindow', v)}
              color="blue"
              lowInfo="Szybka naprawa, mały zasięg"
              highInfo="Dokładna analiza, wolniej"
              disabled={!config.enableClustering}
            />
          </div>

          {/* Local Search Group */}
          <div className="space-y-2 border-l-2 border-emerald-900/50 pl-6 mt-4">
            <ToggleHeader 
              label="Local Search" 
              icon={<Zap className="w-3 h-3" />}
              checked={config.enableLocalSearch}
              onChange={(v) => handleToggle('enableLocalSearch', v)}
              colorClass="text-emerald-200"
            />

            <SliderWithInfo 
              label="2-Opt Iterations"
              value={config.twoOptIterations} min={50} max={500} step={50}
              onChange={(v) => handleChange('twoOptIterations', v)}
              color="emerald"
              lowInfo="Szybki wynik, zgrubny"
              highInfo="Gładsza trasa, dłuższy czas"
              disabled={!config.enableLocalSearch}
            />

            <SliderWithInfo 
              label="3-Opt Iterations"
              value={config.threeOptIterations} min={500} max={10000} step={500}
              onChange={(v) => handleChange('threeOptIterations', v)}
              color="emerald"
              lowInfo="Mniej prób zamian"
              highInfo="Głęboka optymalizacja (CPU!)"
              disabled={!config.enableLocalSearch}
            />
          </div>

          {/* Genetic Group */}
          <div className="space-y-2 border-l-2 border-purple-900/50 pl-6 mt-4">
            <ToggleHeader 
              label="Genetic Algo" 
              icon={<FlaskConical className="w-3 h-3" />}
              checked={config.enableGenetic}
              onChange={(v) => handleToggle('enableGenetic', v)}
              colorClass="text-purple-200"
            />
            
            <SliderWithInfo 
              label="Population Size"
              value={config.gaPopulation} min={10} max={200} step={10}
              onChange={(v) => handleChange('gaPopulation', v)}
              color="purple"
              lowInfo="Szybka ewolucja, ryzyko błędu"
              highInfo="Większa różnorodność genów"
              disabled={!config.enableGenetic}
            />

            <SliderWithInfo 
              label="Generations"
              value={config.gaGenerations} min={10} max={500} step={10}
              onChange={(v) => handleChange('gaGenerations', v)}
              color="purple"
              lowInfo="Krótki czas uczenia"
              highInfo="Długie dojrzewanie wyniku"
              disabled={!config.enableGenetic}
            />

            <SliderWithInfo 
              label="Mutation Rate"
              value={config.gaMutationRate} min={0.01} max={0.5} step={0.01} isFloat
              onChange={(v) => handleChange('gaMutationRate', v)}
              color="purple"
              lowInfo="Stabilność, zbieżność"
              highInfo="Losowość, szukanie nowych dróg"
              disabled={!config.enableGenetic}
            />
          </div>

          {/* U-Turn Logic Group */}
          <div className="space-y-2 border-l-2 border-orange-900/50 pl-6 mt-4">
            <ToggleHeader 
              label="U-Turn Logic" 
              icon={<RotateCw className="w-3 h-3" />}
              checked={config.enableUTurn}
              onChange={(v) => handleToggle('enableUTurn', v)}
              colorClass="text-orange-200"
            />
            
            <SliderWithInfo 
              label="Nadrobienie (bez nawrotki)"
              value={config.uTurnAlternativeDist} min={0} max={300} step={10}
              onChange={(v) => handleChange('uTurnAlternativeDist', v)}
              color="orange"
              lowInfo="Mała strata (krótki objazd)"
              highInfo="Duży objazd (wymusza U-Turn)"
              disabled={!config.enableUTurn}
            />

            <SliderWithInfo 
              label="Nagroda (U-Turn)"
              value={config.uTurnReward} min={0} max={100} step={1}
              onChange={(v) => handleChange('uTurnReward', v)}
              color="orange"
              lowInfo="Neutralnie"
              highInfo="Preferuj nawracanie"
              disabled={!config.enableUTurn}
            />
          </div>

          {/* Scenarios Group */}
          <div className="space-y-4 border-l-2 border-red-900/50 pl-6 mt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-200 mb-2">
              <Activity className="w-3 h-3" /> Scenarios
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {(Object.keys(scenarios) as Array<keyof ScenarioConfig>).map((key) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group hover:bg-gray-800/50 p-2 rounded-xl transition-colors">
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox"
                        checked={scenarios[key]}
                        onChange={() => toggleScenario(key)}
                        className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border border-gray-600 bg-gray-800 transition-all checked:border-red-500 checked:bg-red-500 hover:border-red-400"
                      />
                      <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <span className="text-xs text-gray-300 group-hover:text-white capitalize">{key}</span>
                </label>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default TunerPanel;
