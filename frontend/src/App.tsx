import { useState, useEffect, useRef } from 'react';
import { Terminal, Database, Activity, Code2, PanelLeftClose, PanelLeftOpen, Cpu } from 'lucide-react';
import CommandCenter from './CommandCenter';
import DataRefinery from './DataRefinery';

function App() {
  const [activeTab, setActiveTab] = useState<'harvester' | 'refinery' | 'command'>('harvester');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Harvester Form State
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('google_maps');
  const [limit, setLimit] = useState(10);
  const [isVisible, setIsVisible] = useState(true);
  
  // Terminal State
  const [logs, setLogs] = useState<string[]>(['Arch/C Scrapling Engine v0.1 initialized.', 'Awaiting parameters...']);
  const [isScraping, setIsScraping] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleInitiateScrape = async () => {
    if (!keywords) return;
    
    setIsScraping(true);
    setLogs(['> Connecting to Scrapling Engine...']);

    // 1. Setup WebSocket for live logs
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    const ws = new WebSocket('ws://localhost:8000/api/harvester/logs');
    wsRef.current = ws;

    ws.onmessage = (event) => {
      setLogs((prev) => [...prev, event.data]);
    };

    ws.onclose = () => {
      setLogs((prev) => [...prev, '> Connection closed.']);
      setIsScraping(false);
    };

    // 2. Start Scrape via HTTP POST
    try {
      const response = await fetch('http://localhost:8000/api/harvester/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keywords,
          location,
          source,
          limit,
          isVisible
        }),
      });
      
      if (!response.ok) {
        setLogs((prev) => [...prev, '> Error: Failed to start scraping engine.']);
        setIsScraping(false);
        ws.close();
      }
    } catch (error) {
      setLogs((prev) => [...prev, '> Error: Could not reach backend server.']);
      setIsScraping(false);
      ws.close();
    }
  };

  return (
    <div className="flex h-screen bg-background text-gray-300 overflow-hidden font-mono">
      {/* Sidebar */}
      <div className={`${isSidebarCollapsed ? 'w-16' : 'w-64'} border-r border-gray-800 bg-[#0c0c0c] flex flex-col transition-all duration-300 relative group z-20`}>
        {/* Toggle Button */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-6 bg-gray-800 rounded-full p-1 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {isSidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>

        <div className={`py-8 px-6 border-b border-gray-800 flex flex-col items-center justify-center ${isSidebarCollapsed ? 'px-2' : ''}`}>
          <div className="flex flex-col items-center w-fit cursor-default group">
            <h1 className={`font-display font-bold tracking-tighter leading-none text-white group-hover:text-neon-blue transition-colors duration-500 ${isSidebarCollapsed ? 'text-xl' : 'text-[40px]'}`}>
              {isSidebarCollapsed ? '<A/>' : '<Arch/C>'}
            </h1>
            {!isSidebarCollapsed && (
              <span className="font-mono uppercase tracking-[0.4em] text-[13px] text-white/70 mt-1 pl-[0.4em]">
                STUDIO
              </span>
            )}
          </div>
          {!isSidebarCollapsed && <p className="text-[10px] text-gray-500 mt-4 font-mono tracking-wider">v1.0.0-alpha</p>}
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveTab('harvester')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2' : 'gap-3 px-4 py-3'} rounded-md transition-colors ${
              activeTab === 'harvester' 
                ? 'bg-gray-800/50 text-neon-blue border border-neon-blue' 
                : 'hover:bg-gray-800/30 hover:text-white border border-transparent'
            }`}
            title={isSidebarCollapsed ? 'The Harvester' : ''}
          >
            <Activity size={18} />
            {!isSidebarCollapsed && <span>The Harvester</span>}
          </button>

          <button
            onClick={() => setActiveTab('refinery')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2' : 'gap-3 px-4 py-3'} rounded-md transition-colors ${
              activeTab === 'refinery' 
                ? 'bg-gray-800/50 text-neon-blue border border-neon-blue' 
                : 'hover:bg-gray-800/30 hover:text-white border border-transparent'
            }`}
            title={isSidebarCollapsed ? 'Veri Rafinerisi' : ''}
          >
            <Database size={18} />
            {!isSidebarCollapsed && <span>Veri Rafinerisi</span>}
          </button>

          <button
            onClick={() => setActiveTab('command')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2' : 'gap-3 px-4 py-3'} rounded-md transition-colors ${
              activeTab === 'command' 
                ? 'bg-gray-800/50 text-neon-blue border border-neon-blue' 
                : 'hover:bg-gray-800/30 hover:text-white border border-transparent'
            }`}
            title={isSidebarCollapsed ? 'Komuta Merkezi' : ''}
          >
            <Cpu size={18} />
            {!isSidebarCollapsed && <span>Komuta Merkezi</span>}
          </button>
        </nav>
        
        <div className={`p-4 border-t border-gray-800 text-xs text-gray-600 flex flex-col gap-2 ${isSidebarCollapsed ? 'items-center' : ''}`}>
          <div className="flex items-center gap-2" title={isSidebarCollapsed ? 'System Idle' : ''}>
            <div className={`w-2 h-2 rounded-full ${isScraping ? 'bg-neon-blue animate-pulse' : 'bg-gray-500'}`}></div>
            {!isSidebarCollapsed && <span>{isScraping ? 'System Active' : 'System Idle'}</span>}
          </div>
          <div className="flex items-center gap-2" title={isSidebarCollapsed ? 'Local Storage Active' : ''}>
            <Database size={12} />
            {!isSidebarCollapsed && <span>Local Storage Active</span>}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-16 border-b border-gray-800 flex items-center px-6 justify-between bg-[#0a0a0a]/80 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-white tracking-widest">
            {activeTab === 'harvester' && '> THE_HARVESTER'}
            {activeTab === 'refinery' && '> DATA_REFINERY'}
            {activeTab === 'command' && '> COMMAND_CENTER'}
          </h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2"><Terminal size={16}/> LLM: Disconnected</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 relative">
           {activeTab === 'harvester' && (
              <div className="h-full flex flex-col md:flex-row gap-6">
                {/* Control Panel */}
                <div className="w-full md:w-1/3 bg-[#111] border border-gray-800 rounded-lg p-5 flex flex-col gap-4 overflow-y-auto">
                  <h3 className="text-neon-blue font-bold mb-2">TARGET PARAMETERS</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Source Target</label>
                      <select 
                        value={source} 
                        onChange={e => setSource(e.target.value)}
                        className="w-full bg-[#050505] border border-gray-700 rounded p-2 text-sm focus:border-neon-blue focus:outline-none transition-colors"
                      >
                        <option value="google_maps">Google Maps</option>
                        <option value="google_search">Google Search</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Keywords</label>
                      <input 
                        type="text" 
                        value={keywords}
                        onChange={e => setKeywords(e.target.value)}
                        className="w-full bg-[#050505] border border-gray-700 rounded p-2 text-sm focus:border-neon-blue focus:outline-none transition-colors" 
                        placeholder="e.g. software companies" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Location</label>
                      <input 
                        type="text" 
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        className="w-full bg-[#050505] border border-gray-700 rounded p-2 text-sm focus:border-neon-blue focus:outline-none transition-colors" 
                        placeholder="e.g. London" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Max Results Limit</label>
                      <input 
                        type="number" 
                        value={limit}
                        onChange={e => setLimit(parseInt(e.target.value) || 10)}
                        min="1"
                        max="100"
                        className="w-full bg-[#050505] border border-gray-700 rounded p-2 text-sm focus:border-neon-blue focus:outline-none transition-colors" 
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <input 
                        type="checkbox" 
                        id="visibleToggle"
                        checked={isVisible}
                        onChange={e => setIsVisible(e.target.checked)}
                        className="accent-[#04D9FF] w-4 h-4 cursor-pointer"
                      />
                      <label htmlFor="visibleToggle" className="text-xs text-gray-400 cursor-pointer hover:text-white transition-colors">
                        Görünür Mod (Tarayıcıyı Göster)
                      </label>
                    </div>
                    <button 
                      onClick={handleInitiateScrape}
                      disabled={isScraping || !keywords}
                      className={`w-full py-3 rounded font-bold transition-all mt-4 border 
                        ${isScraping || !keywords ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' : 'bg-transparent border-neon-blue text-neon-blue hover:bg-[#04D9FF]/10'}`}
                    >
                      {isScraping ? 'SCRAPING IN PROGRESS...' : 'INITIATE SCRAPE'}
                    </button>
                  </div>
                </div>

                {/* Live Monitor */}
                <div className="w-full md:w-2/3 bg-[#050505] border border-gray-800 rounded-lg p-0 flex flex-col overflow-hidden relative">
                  <div className="bg-[#111] px-4 py-2 border-b border-gray-800 text-xs text-gray-500 flex justify-between items-center">
                    <span>LIVE TERMINAL</span>
                    <span className={isScraping ? "text-neon-blue animate-pulse" : "text-gray-500"}>
                      {isScraping ? 'Receiving...' : 'Idle'}
                    </span>
                  </div>
                  <div className="flex-1 p-4 font-mono text-sm text-gray-400 overflow-y-auto">
                    {logs.map((log, index) => (
                      <div key={index} className={log.includes('Error') ? 'text-red-500' : log.includes('Success') ? 'text-neon-blue' : ''}>
                        {log}
                      </div>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>
                </div>
              </div>
           )}

            {activeTab === 'refinery' && (
              <DataRefinery />
            )}

            {activeTab === 'command' && (
              <CommandCenter />
            )}
        </main>
      </div>
    </div>
  );
}

export default App;
