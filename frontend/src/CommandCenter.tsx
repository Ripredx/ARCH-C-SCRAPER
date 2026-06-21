import { useState, useEffect } from 'react';
import { BarChart2, Cpu } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import DOMPurify from 'dompurify';

export default function CommandCenter() {
  const [reports, setReports] = useState<string[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string>('');
  
  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');
  const [isModalLoading, setIsModalLoading] = useState(false);
  
  const [currentCompany, setCurrentCompany] = useState('');
  const [deepCrawlDone, setDeepCrawlDone] = useState(false);
  const [deepCrawlUrl, setDeepCrawlUrl] = useState('');
  const [showIframe, setShowIframe] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8000/api/forge/reports')
      .then(res => res.json())
      .then(data => setReports(data.reports))
      .catch(err => console.error("Could not fetch reports:", err));
  }, []);

  const handleSelectReport = async (filename: string) => {
    setSelectedReport(filename);
    setReportHtml('');
    
    try {
      const res = await fetch(`http://localhost:8000/api/forge/report/${filename.replace('.html', '')}`);
      const data = await res.json();
      if (data.exists) {
        setReportHtml(data.html);
      }
    } catch (err) {
      console.error(err);
      setReportHtml('// Rapor yüklenemedi');
    }
  };

  const triggerAction = async (action: string, company: string, url: string) => {
    if (!action) return;
    
    setModalOpen(true);
    setIsModalLoading(true);
    setModalContent('');
    setCurrentCompany(company);
    setDeepCrawlDone(false);
    setDeepCrawlUrl('');
    setModalTitle(action === 'deep-crawl' ? `${company} - Derin Kazıma` : `${company} - Satış Metni (Soğuk E-posta)`);
    
    try {
      if (action === 'deep-crawl') {
        const res = await fetch('http://localhost:8000/api/forge/deep-crawl-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url, company_name: company })
        });
        
        if (res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            let chunk = decoder.decode(value, { stream: true });
            if (chunk.includes("REPORT_URL:")) {
              const parts = chunk.split("REPORT_URL:");
              const urlPart = parts[1].split("\n")[0];
              setDeepCrawlUrl(urlPart.trim());
              chunk = parts[0] + (parts[1].substring(urlPart.length + 1) || "");
            }
            if (chunk.includes("DONE")) {
              setModalContent(prev => prev + chunk.replace("DONE", ""));
              if (!chunk.includes("HATA")) {
                setDeepCrawlDone(true);
              }
              break;
            }
            setModalContent(prev => prev + chunk);
          }
        }
      } else if (action === 'generate-pitch') {
        const res = await fetch('http://localhost:8000/api/forge/generate-pitch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_name: company, industry: 'Genel' })
        });
        const data = await res.json();
        setModalContent(data.pitch || JSON.stringify(data));
      }
    } catch (err) {
      setModalContent(`Bağlantı hatası: ${err}`);
    } finally {
      setIsModalLoading(false);
    }
  };

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'DEEP_CRAWL') {
        triggerAction('deep-crawl', e.data.company_name, e.data.url);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleAnalyzeCrawl = async () => {
    setIsModalLoading(true);
    setModalTitle(`${currentCompany} - Yapay Zeka Analizi`);
    setModalContent('');
    setDeepCrawlDone(false);

    try {
      const res = await fetch('http://localhost:8000/api/forge/analyze-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: currentCompany })
      });
      const data = await res.json();
      setModalContent(data.report || JSON.stringify(data));
    } catch (err) {
      setModalContent(`Bağlantı hatası: ${err}`);
    } finally {
      setIsModalLoading(false);
    }
  };

  return (
    <div className="h-full bg-background overflow-hidden border border-gray-800 rounded-lg relative">
      <PanelGroup direction="horizontal">
        {/* LEFT PANEL: Reports Explorer */}
        <Panel defaultSize={20} minSize={10} maxSize={40} className="flex flex-col bg-[#050505] border-r border-gray-800">
          <div className="bg-[#0c0c0c] px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-bold flex items-center gap-2">
              <BarChart2 size={14} /> SİSTEMDEKİ RAPORLAR
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {reports.map(f => (
              <button
                key={f}
                onClick={() => handleSelectReport(f)}
                className={`w-full text-left px-3 py-3 text-xs truncate transition-colors border-b border-gray-800/50 ${
                  selectedReport === f ? 'bg-neon-blue/20 text-neon-blue border-l-2 border-l-neon-blue' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
                title={f}
              >
                {f.replace('report_', '').replace('.html', '')}
              </button>
            ))}
            {reports.length === 0 && (
              <div className="p-4 text-xs text-gray-600 text-center">Henüz rapor yok. Veri Kazıma menüsünden arama yaparak rapor üretebilirsiniz.</div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-neon-blue transition-colors cursor-col-resize group relative z-10">
          <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
        </PanelResizeHandle>

        {/* RIGHT PANEL: HTML Report & Actions */}
        <Panel>
          <div className="flex flex-col h-full bg-[#111]">
            <div className="bg-[#0c0c0c] px-6 py-4 border-b border-gray-800 flex items-center gap-2">
              <Cpu size={16} className="text-neon-blue" />
              <span className="text-sm text-gray-200 font-bold tracking-widest">SATIŞ VE RAPORLAMA PANELİ</span>
            </div>
            
            <div className="flex-1 w-full h-full bg-[#0a0a0a]">
              {selectedReport ? (
                <iframe 
                  src={`http://localhost:8000/static/reports/${selectedReport}`} 
                  className="w-full h-full border-0 bg-transparent"
                  title="AI Report"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 font-mono space-y-4">
                  <div className="text-4xl">🤖</div>
                  <div className="tracking-widest uppercase">Sol listeden bir rapor seçin</div>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* AI MODAL */}
      {modalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0c0c0c] border border-gray-700 rounded-lg shadow-2xl flex flex-col w-full max-w-4xl max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-[#111] rounded-t-lg">
              <h3 className="text-neon-blue font-bold tracking-wide flex items-center gap-2">
                <Cpu size={18} className={isModalLoading ? "animate-pulse" : ""} /> {modalTitle}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-white transition-colors bg-gray-800/50 hover:bg-gray-700 p-1 rounded">
                ✕
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 overflow-y-auto text-sm text-gray-300">
              {isModalLoading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-6">
                  <div className="w-10 h-10 border-2 border-neon-blue border-t-transparent rounded-full animate-spin"></div>
                  <div className="flex flex-col items-center">
                    <p className="text-neon-blue font-mono font-bold tracking-widest animate-pulse mb-2">İŞLEM YAPILIYOR...</p>
                    <p className="text-gray-500 text-xs text-center max-w-md">Lütfen bekleyin...</p>
                  </div>
                </div>
              ) : (
                <div className="prose prose-invert max-w-none prose-sm whitespace-pre-wrap font-mono leading-relaxed bg-black p-4 rounded border border-gray-800/50">
                  {modalContent}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-gray-800 bg-[#0a0a0a] rounded-b-lg flex justify-between items-center">
              <span className="text-xs text-gray-600 font-mono">Destek: Playwright & Yapay Zeka</span>
              <div className="flex gap-2">
                {deepCrawlUrl && (
                  <button 
                    onClick={() => setShowIframe(true)}
                    className="px-4 py-2 border rounded text-xs font-semibold transition-colors bg-[#00FFFF]/10 text-[#00FFFF] border-[#00FFFF]/30 hover:bg-[#00FFFF] hover:text-black"
                  >
                    Raporu Görüntüle
                  </button>
                )}
                {deepCrawlDone && (
                  <button 
                    onClick={handleAnalyzeCrawl}
                    className="px-4 py-2 border rounded text-xs font-semibold transition-colors bg-[#FF007F]/10 text-[#FF007F] border-[#FF007F]/30 hover:bg-[#FF007F] hover:text-white"
                  >
                    Veriyi AI ile Yorumla
                  </button>
                )}
                <button 
                  disabled={isModalLoading}
                  onClick={() => {
                    navigator.clipboard.writeText(modalContent);
                  }} 
                  className={`px-4 py-2 border rounded text-xs font-semibold transition-colors ${
                    isModalLoading ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed' : 'bg-neon-blue/10 text-neon-blue border-neon-blue/30 hover:bg-neon-blue hover:text-black'
                  }`}
                >
                  Metni Kopyala
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Iframe Modal for Deep Crawl Report */}
      {showIframe && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="w-full h-full max-w-7xl max-h-[95vh] bg-[#050505] border border-gray-700 rounded-lg shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-3 border-b border-gray-800 bg-[#111] rounded-t-lg">
              <h3 className="text-[#00FFFF] font-bold tracking-wide flex items-center gap-2"><Cpu size={16} /> Derin Tarama Raporu</h3>
              <div className="flex gap-2">
                <button onClick={() => window.open(deepCrawlUrl, '_blank')} className="text-gray-400 hover:text-white px-3 py-1 bg-gray-800/50 hover:bg-gray-700 rounded text-xs transition-colors">
                  Yeni Sekmede Aç
                </button>
                <button onClick={() => setShowIframe(false)} className="text-gray-400 hover:text-white px-3 py-1 bg-[#FF007F]/20 hover:bg-[#FF007F] hover:text-white border border-[#FF007F]/30 rounded text-xs transition-colors">
                  Kapat
                </button>
              </div>
            </div>
            <div className="flex-1 w-full bg-white rounded-b-lg overflow-hidden">
              <iframe src={deepCrawlUrl} className="w-full h-full border-0" title="Deep Crawl Report" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
