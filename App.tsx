
import React, { useState } from 'react';
import { Layout, Navigation, Map, Route, Activity } from 'lucide-react';
import RouteWorkspace from './components/RouteWorkspace';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState<Set<number>>(new Set([0]));

  const handleTabChange = (index: number) => {
    setActiveTab(index);
    setVisitedTabs(prev => new Set(prev).add(index));
  };

  const tabs = [
    { id: 0, name: 'Trasa Główna', icon: <Layout className="w-4 h-4" /> },
    { id: 1, name: 'Trasa A', icon: <Route className="w-4 h-4" /> },
    { id: 2, name: 'Trasa B', icon: <Map className="w-4 h-4" /> }
  ];

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-200 font-sans flex flex-col selection:bg-blue-500/30 overflow-x-hidden">
      
      {/* Top Navigation Panel - Modern Cyberpunk/Tech aesthetic */}
      <div className="sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur-md border-b border-gray-800/60 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4">
           <div className="flex flex-col md:flex-row items-center justify-between py-3 md:h-20 gap-4 md:gap-0">
              
              {/* Brand / Logo Area */}
              <div className="w-full md:w-auto flex items-center justify-between">
                 <div className="flex items-center gap-3 group cursor-default select-none">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all duration-300 border border-white/10">
                       <Navigation className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex flex-col justify-center">
                       <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400 tracking-tight leading-none">
                         ROUTE<span className="text-blue-500">BENCH</span>
                       </span>
                       <span className="text-[10px] text-gray-500 tracking-[0.2em] uppercase font-bold mt-0.5">Studio v3.0</span>
                    </div>
                 </div>

                 {/* Mobile Status Indicator */}
                 <div className="md:hidden flex items-center gap-2 text-[10px] font-bold text-emerald-400 bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-500/20">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    ONLINE
                 </div>
              </div>
              
              {/* Navigation Tabs */}
              <div className="w-full md:w-auto overflow-x-auto pb-1 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 no-scrollbar">
                <div className="flex items-center bg-gray-900/60 p-1.5 rounded-[2rem] border border-gray-800/50 backdrop-blur-sm shadow-inner min-w-full md:min-w-max">
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`
                          relative flex-1 md:flex-none flex items-center justify-center px-4 md:px-6 py-2.5 rounded-3xl text-sm font-bold transition-all duration-300 ease-out whitespace-nowrap
                          ${isActive 
                            ? 'text-white bg-gray-800 shadow-lg shadow-black/20 ring-1 ring-white/5' 
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
                          }
                        `}
                      >
                        {isActive && (
                           <span className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                        )}
                        <span className={`mr-2 transition-colors duration-300 ${isActive ? 'text-blue-400' : 'text-gray-600'}`}>
                          {tab.icon}
                        </span>
                        {tab.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Side Status (Desktop) */}
              <div className="hidden md:flex items-center gap-4 border-l border-gray-800 pl-6 ml-2">
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      SYSTEM ONLINE
                    </div>
                    <span className="text-[10px] text-gray-600 font-mono">LATENCY: 12ms</span>
                  </div>
              </div>
           </div>
        </div>
      </div>

      {/* Workspaces */}
      <div className="flex-1 relative">
        {/* Ambient Background Noise */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none mix-blend-overlay"></div>
        
        {tabs.map((tab) => (
          <div 
            key={tab.id} 
            style={{ display: activeTab === tab.id ? 'block' : 'none' }}
            className="animate-in fade-in duration-500 slide-in-from-bottom-1"
          >
            {visitedTabs.has(tab.id) && (
               <RouteWorkspace workspaceId={tab.id} isActive={activeTab === tab.id} />
            )}
          </div>
        ))}
      </div>

    </div>
  );
};

export default App;
