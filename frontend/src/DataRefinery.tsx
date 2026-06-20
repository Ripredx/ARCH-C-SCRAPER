import { useState, useEffect, useRef } from 'react';
import { FileJson, Cpu, Play } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';

SyntaxHighlighter.registerLanguage('json', json);

export default function DataRefinery() {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'json' | 'terminal'>('json');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [terminalLog, setTerminalLog] = useState<string>('');
  const [hasSavedReport, setHasSavedReport] = useState<boolean>(false);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLog]);

  useEffect(() => {
    fetch('http://localhost:8080/api/forge/files')
      .then(res => res.json())
      .then(data => setFiles(data.files))
      .catch(err => console.error("Could not fetch files:", err));
  }, []);

  const handleSelectFile = async (filename: string) => {
    setSelectedFile(filename);
    setTerminalLog('');
    setHasSavedReport(false);
    
    try {
      const res = await fetch(`http://localhost:8080/api/forge/files/${filename}`);
      const data = await res.json();
      setFileContent(JSON.stringify(data, null, 2));

      const reportRes = await fetch(`http://localhost:8080/api/forge/report/${filename}`);
      const reportData = await reportRes.json();
      
      if (reportData.exists) {
        setHasSavedReport(true);
        setTerminalLog(`> Önceki oturumdan kayıtlı analiz raporu bulundu.\n> Kaynak dosya: ${filename}\n> Rapor "Komuta Merkezi" sekmesinde incelenebilir.\n> Yeniden oluşturmak isterseniz "YENİDEN İŞLE" butonuna tıklayabilirsiniz.`);
      }
    } catch (err) {
      console.error(err);
      setFileContent('// Error loading file content');
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setActiveTab('terminal');
    setTerminalLog('> Veriler Python motoruna gönderiliyor...');

    try {
      const response = await fetch('http://localhost:8080/api/forge/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedFile })
      });

      if (!response.ok) throw new Error("API hatası: " + response.statusText);

      const data = await response.json();
      setTerminalLog(data.log + '\n\n> İşlem tamamlandı. Sonuçları görmek için "Komuta Merkezi" sekmesine geçebilirsiniz.');
      setHasSavedReport(true);
      
    } catch (error) {
      setTerminalLog(prev => prev + `\n\n> Error: ${error}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="h-full bg-background overflow-hidden border border-gray-800 rounded-lg">
      <PanelGroup direction="horizontal">
        {/* LEFT PANEL: File Explorer */}
        <Panel defaultSize={20} minSize={10} maxSize={40} className="flex flex-col bg-[#050505] border-r border-gray-800">
          <div className="bg-[#0c0c0c] px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-bold flex items-center gap-2">
              <FileJson size={14} /> HAM VERİ DOSYALARI
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {files.map(f => (
              <button
                key={f}
                onClick={() => handleSelectFile(f)}
                className={`w-full text-left px-3 py-3 text-xs truncate transition-colors border-b border-gray-800/50 ${
                  selectedFile === f ? 'bg-neon-blue/20 text-neon-blue border-l-2 border-l-neon-blue' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
                title={f}
              >
                {f.replace('raw_data_google_maps_', '')}
              </button>
            ))}
            {files.length === 0 && (
              <div className="p-4 text-xs text-gray-600 text-center">Henüz veri dosyası yok. The Harvester ile veri toplayın.</div>
            )}
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
                  onClick={() => setActiveTab('json')}
                  className={`px-4 py-3 text-xs font-mono flex items-center gap-2 border-r border-gray-800 transition-colors ${
                    activeTab === 'json' ? 'bg-[#0c0c0c] text-neon-blue border-t-2 border-t-neon-blue' : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a] border-t-2 border-t-transparent'
                  }`}
                >
                  <FileJson size={14} /> Ham Veri İnceleme
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
                <button
                  onClick={handleAnalyze}
                  disabled={!selectedFile || isAnalyzing}
                  className={`text-xs px-4 py-1.5 rounded flex items-center gap-2 border transition-colors font-bold tracking-wider ${
                    !selectedFile || isAnalyzing 
                      ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' 
                      : 'bg-transparent border-neon-blue text-neon-blue hover:bg-neon-blue/10'
                  }`}
                >
                  <Play size={12} fill="currentColor" /> {isAnalyzing ? 'İŞLENİYOR...' : (hasSavedReport ? 'YENİDEN İŞLE' : 'AJANA GÖNDER')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
              {activeTab === 'json' && (
                <div className="h-full overflow-y-auto text-xs">
                  {selectedFile ? (
                    <SyntaxHighlighter
                      language="json"
                      style={vs2015}
                      customStyle={{ margin: 0, padding: '1.5rem', background: 'transparent', height: '100%' }}
                    >
                      {fileContent}
                    </SyntaxHighlighter>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-600 font-mono tracking-widest uppercase">
                      İşlenecek veriyi seçin
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
    </div>
  );
}
