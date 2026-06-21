import { useState, useEffect, useRef } from 'react';
import { FileJson, Cpu, Play, ChevronDown, ChevronRight, FileCode2, Globe } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';

SyntaxHighlighter.registerLanguage('json', json);

type FileCategories = {
  harvester_raw: string[];
  llm_reports: string[];
  deep_crawl_reports: string[];
};

export default function DataRefinery() {
  const [categories, setCategories] = useState<FileCategories>({
    harvester_raw: [],
    llm_reports: [],
    deep_crawl_reports: []
  });
  
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    harvester_raw: true,
    llm_reports: false,
    deep_crawl_reports: false
  });

  const [selectedFile, setSelectedFile] = useState<{ category: string, filename: string, type: 'json' | 'html' } | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'view' | 'terminal'>('view');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [terminalLog, setTerminalLog] = useState<string>('');
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLog]);

  useEffect(() => {
    fetch('http://localhost:8000/api/forge/all-files')
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(err => console.error("Could not fetch files:", err));
  }, []);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSelectFile = async (category: string, filename: string) => {
    const isHtml = filename.endsWith('.html');
    setSelectedFile({ category, filename, type: isHtml ? 'html' : 'json' });
    setTerminalLog('');
    
    if (!isHtml) {
      try {
        const res = await fetch(`http://localhost:8000/api/forge/content/${category}/${filename}`);
        const data = await res.json();
        setFileContent(data.content);
      } catch (err) {
        console.error(err);
        setFileContent('// Error loading file content');
      }
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile || selectedFile.category !== 'harvester_raw') return;
    setIsAnalyzing(true);
    setActiveTab('terminal');
    setTerminalLog('> Veriler Python motoruna gönderiliyor...');

    try {
      const response = await fetch('http://localhost:8000/api/forge/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedFile.filename })
      });

      if (!response.ok) throw new Error("API hatası: " + response.statusText);

      const data = await response.json();
      setTerminalLog(data.log + '\n\n> İşlem tamamlandı. Sonuçları görmek için "Komuta Merkezi" sekmesine geçebilirsiniz.');
      
      // Refresh files list
      const resFiles = await fetch('http://localhost:8000/api/forge/all-files');
      const dataFiles = await resFiles.json();
      setCategories(dataFiles);
      
    } catch (error) {
      setTerminalLog(prev => prev + `\n\n> Error: ${error}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderFileList = (categoryKey: keyof FileCategories, title: string, icon: React.ReactNode) => {
    const files = categories[categoryKey];
    const isOpen = openSections[categoryKey];

    return (
      <div className="border-b border-gray-800">
        <button 
          onClick={() => toggleSection(categoryKey)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[#0c0c0c] hover:bg-[#111] transition-colors"
        >
          <span className="text-xs text-gray-500 font-bold flex items-center gap-2 tracking-wider">
            {icon} {title}
          </span>
          {isOpen ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
        </button>
        
        {isOpen && (
          <div className="flex flex-col bg-[#050505] max-h-60 overflow-y-auto">
            {files.map(f => {
              const isSelected = selectedFile?.filename === f && selectedFile?.category === categoryKey;
              return (
                <button
                  key={f}
                  onClick={() => handleSelectFile(categoryKey, f)}
                  className={`w-full text-left px-4 py-2.5 text-xs truncate transition-colors border-b border-gray-800/30 ${
                    isSelected ? 'bg-neon-blue/20 text-neon-blue border-l-2 border-l-neon-blue' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                  title={f}
                >
                  {f.replace('raw_data_google_maps_', '').replace('_deep_crawl', '').replace('report_raw_data_google_maps_', '')}
                </button>
              );
            })}
            {files.length === 0 && (
              <div className="p-3 text-xs text-gray-700 italic px-4">Boş.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full bg-background overflow-hidden border border-gray-800 rounded-lg">
      <PanelGroup direction="horizontal">
        {/* LEFT PANEL: File Explorer */}
        <Panel defaultSize={25} minSize={15} maxSize={40} className="flex flex-col bg-[#050505] border-r border-gray-800">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {renderFileList('harvester_raw', 'HARVESTER HAM VERİLERİ', <FileJson size={14} />)}
            {renderFileList('llm_reports', 'LLM SATIŞ RAPORLARI', <FileCode2 size={14} />)}
            {renderFileList('deep_crawl_reports', 'DEEP CRAWL RAPORLARI', <Globe size={14} />)}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-neon-blue transition-colors cursor-col-resize group relative z-10">
          <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
        </PanelResizeHandle>

        {/* RIGHT PANEL: Content Area */}
        <Panel>
          <div className="flex flex-col h-full bg-[#0c0c0c]">
            <div className="flex items-center justify-between border-b border-gray-800 bg-[#111]">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('view')}
                  className={`px-4 py-3 text-xs font-mono flex items-center gap-2 border-r border-gray-800 transition-colors ${
                    activeTab === 'view' ? 'bg-[#0c0c0c] text-neon-blue border-t-2 border-t-neon-blue' : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a] border-t-2 border-t-transparent'
                  }`}
                >
                  <FileJson size={14} /> Görüntüleyici
                </button>
                <button
                  onClick={() => setActiveTab('terminal')}
                  className={`px-4 py-3 text-xs font-mono flex items-center gap-2 border-r border-gray-800 transition-colors ${
                    activeTab === 'terminal' ? 'bg-[#0c0c0c] text-neon-blue border-t-2 border-t-neon-blue' : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a] border-t-2 border-t-transparent'
                  }`}
                >
                  <Cpu size={14} className={isAnalyzing && activeTab !== 'terminal' ? "animate-pulse text-neon-blue" : ""} /> Ajan Terminali
                </button>
              </div>
              
              <div className="px-4">
                {selectedFile?.category === 'harvester_raw' && (
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className={`text-xs px-4 py-1.5 rounded flex items-center gap-2 border transition-colors font-bold tracking-wider ${
                      isAnalyzing 
                        ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' 
                        : 'bg-transparent border-neon-blue text-neon-blue hover:bg-neon-blue/10'
                    }`}
                  >
                    <Play size={12} fill="currentColor" /> {isAnalyzing ? 'İŞLENİYOR...' : 'YAPAY ZEKAYA GÖNDER'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
              {activeTab === 'view' && (
                <div className="h-full overflow-y-auto bg-[#0a0a0a]">
                  {selectedFile ? (
                    selectedFile.type === 'json' ? (
                      <div className="text-xs h-full">
                        <SyntaxHighlighter
                          language="json"
                          style={vs2015}
                          customStyle={{ margin: 0, padding: '1.5rem', background: 'transparent', height: '100%' }}
                        >
                          {fileContent}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <iframe 
                        src={`http://localhost:8000/static/${selectedFile.category.startsWith('deep_crawl') ? 'deep_crawl' : selectedFile.category}/${selectedFile.filename}`}
                        className="w-full h-full border-0 bg-white"
                        title="HTML Report"
                      />
                    )
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-600 font-mono tracking-widest uppercase">
                      İncelenecek bir dosya seçin
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === 'terminal' && (
                <div className="h-full bg-black p-6 font-mono text-sm overflow-y-auto">
                  {terminalLog ? (
                    <pre className="whitespace-pre-wrap font-mono text-[13px] text-gray-300 leading-relaxed">{terminalLog}</pre>
                  ) : (
                    <div className="text-gray-600 italic">...Sistem hazır. İşlem bekliyor...</div>
                  )}
                  <div ref={terminalEndRef} />
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #050505;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1f2937;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #374151;
        }
      `}</style>
    </div>
  );
}
