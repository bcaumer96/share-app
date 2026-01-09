
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Peer, FileTransfer, ConnectionState } from './types';
import { analyzeFile } from './services/geminiService';

const ICON_SIZE = "w-5 h-5";

const Icon = ({ name, className = ICON_SIZE }: { name: string, className?: string }) => {
  const icons: Record<string, React.ReactElement> = {
    send: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>,
    receive: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
    file: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
    check: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
    search: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
    sparkles: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" /></svg>,
    copy: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>,
    link: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
    shield: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
    user: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  };
  return <div className={className}>{icons[name] || icons.file}</div>;
};

const App: React.FC = () => {
  const [myId] = useState(() => Math.random().toString(36).substring(7).toUpperCase());
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [sdpData, setSdpData] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const initWebRTC = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pc.onicecandidate = (event) => {
      if (event.candidate === null) setSdpData(JSON.stringify(pc.localDescription));
    };
    pc.ondatachannel = (event) => setupDataChannel(event.channel);
    pcRef.current = pc;
    return pc;
  }, []);

  const setupDataChannel = (channel: RTCDataChannel) => {
    channel.onopen = () => setConnectionState('connected');
    channel.onclose = () => setConnectionState('idle');
    channel.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'file-meta') {
          const analysis = await analyzeFile(data.name, data.size);
          const newTransfer: FileTransfer = {
            id: data.id,
            name: data.name,
            size: data.size,
            progress: 0,
            status: 'transferring',
            direction: 'incoming',
            geminiAnalysis: analysis
          };
          setTransfers(prev => [newTransfer, ...prev]);
        } else if (data.type === 'file-chunk') {
           setTransfers(prev => prev.map(t => 
            t.id === data.id ? { ...t, progress: (data.index / data.total) * 100 } : t
          ));
        } else if (data.type === 'file-complete') {
          setTransfers(prev => prev.map(t => 
            t.id === data.id ? { ...t, progress: 100, status: 'completed' } : t
          ));
        }
      } catch (e) {}
    };
    dataChannelRef.current = channel;
  };

  const createOffer = async () => {
    const pc = initWebRTC();
    const channel = pc.createDataChannel('fileTransfer');
    setupDataChannel(channel);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setConnectionState('offering');
  };

  const handleConnect = async () => {
    if (!sdpData) return;
    try {
      const data = JSON.parse(sdpData);
      if (data.type === 'offer') {
        const pc = initWebRTC();
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        setConnectionState('answering');
      } else if (data.type === 'answer') {
        if (pcRef.current) await pcRef.current.setRemoteDescription(new RTCSessionDescription(data));
      }
    } catch (e) { alert('Invalid connection sequence'); }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !dataChannelRef.current) return;
    const transferId = Math.random().toString(36).substring(7);
    const analysis = await analyzeFile(file.name, file.size);
    setTransfers(prev => [{
      id: transferId, name: file.name, size: file.size, progress: 0, 
      status: 'transferring', direction: 'outgoing', geminiAnalysis: analysis
    }, ...prev]);

    dataChannelRef.current.send(JSON.stringify({ type: 'file-meta', id: transferId, name: file.name, size: file.size }));
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        clearInterval(interval);
        dataChannelRef.current?.send(JSON.stringify({ type: 'file-complete', id: transferId }));
        setTransfers(prev => prev.map(t => t.id === transferId ? { ...t, progress: 100, status: 'completed' } : t));
      } else {
        dataChannelRef.current?.send(JSON.stringify({ type: 'file-chunk', id: transferId, index: progress, total: 100 }));
        setTransfers(prev => prev.map(t => t.id === transferId ? { ...t, progress } : t));
      }
    }, 150);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-10 transition-colors duration-1000">
      {/* Premium Header */}
      <header className="w-full max-w-5xl flex justify-between items-center mb-16 px-4">
        <div className="flex items-center gap-6">
          <div className="relative group">
            <div className={`absolute inset-0 rounded-2xl digital-aura opacity-75 blur-md scale-110 transition-transform duration-700 ${connectionState === 'connected' ? 'scale-125 opacity-100' : ''}`}></div>
            <div className="relative w-16 h-16 md:w-20 md:h-20 bg-slate-900 rounded-3xl shadow-2xl flex items-center justify-center text-white border border-white/20">
              <Icon name="shield" className="w-10 h-10" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              UmerShare 
              <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-md font-bold tracking-widest uppercase">Elite</span>
            </h1>
            <p className="text-sm font-medium text-slate-500 tracking-wide mt-1">Next-Gen P2P Data Fabric</p>
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          <div className="bg-white/50 backdrop-blur-md px-5 py-2.5 rounded-2xl shadow-sm border border-white flex items-center gap-3">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em]">Access Node</span>
            <span className="text-sm font-mono font-bold text-slate-700">{myId}</span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Interaction Pillar */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          <section className="glass-card rounded-[2.5rem] p-10 shadow-2xl shadow-indigo-100/50 flex flex-col items-center text-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Icon name="shield" className="w-24 h-24" />
            </div>

            <div className="mb-8 relative">
              <div className="w-20 h-20 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-200 flex items-center justify-center text-white transform group-hover:rotate-12 transition-transform duration-500">
                <Icon name="search" className="w-10 h-10" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold mb-3 tracking-tight">Establish Secure Link</h2>
            <p className="text-slate-500 mb-10 text-sm leading-relaxed max-w-[280px]">
              Deploy a direct, end-to-end encrypted tunnel between your local nodes.
            </p>

            {connectionState === 'idle' ? (
              <button 
                onClick={createOffer}
                className="w-full bg-slate-900 hover:bg-black text-white py-5 px-8 rounded-2xl font-bold transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-95"
              >
                <span>Initiate Session</span>
                <Icon name="link" className="w-5 h-5" />
              </button>
            ) : connectionState === 'connected' ? (
              <div className="w-full bg-emerald-500 text-white py-5 px-8 rounded-2xl flex items-center justify-center gap-3 font-bold shadow-lg shadow-emerald-200">
                <Icon name="check" className="w-5 h-5" />
                <span>Link Active</span>
              </div>
            ) : (
              <div className="w-full space-y-5">
                <div className="bg-slate-100/50 p-5 rounded-2xl text-left border border-slate-200">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Tunnel Payload</label>
                  <div className="flex items-center gap-3">
                    <input readOnly value={sdpData} className="bg-transparent text-xs text-slate-500 truncate w-full outline-none font-mono" />
                    <button onClick={() => { navigator.clipboard.writeText(sdpData); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }} className="text-indigo-600 hover:scale-110 transition-transform">
                      {copyFeedback ? <Icon name="check" className="w-5 h-5" /> : <Icon name="copy" className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <textarea 
                  placeholder="Paste response payload..."
                  className="w-full h-32 bg-white border border-slate-200 rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none transition-all shadow-inner"
                  onChange={(e) => setSdpData(e.target.value)}
                />
                <button onClick={handleConnect} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 px-8 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-200">
                  Validate Link
                </button>
              </div>
            )}
          </section>

          <section className={`glass-card rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/50 transition-all duration-700 ${connectionState !== 'connected' ? 'opacity-40 grayscale pointer-events-none' : 'hover:shadow-indigo-100'}`}>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold tracking-tight">Injection Point</h2>
              <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                <Icon name="send" />
              </div>
            </div>
            <div className="relative group">
              <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={handleFileUpload} />
              <div className="border-3 border-dashed border-slate-200 group-hover:border-indigo-400 group-hover:bg-indigo-50/50 rounded-[2rem] py-14 text-center transition-all duration-300">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform">
                  <Icon name="file" className="w-8 h-8 text-slate-300 group-hover:text-indigo-500" />
                </div>
                <p className="text-slate-600 font-bold">Transmit New Data</p>
                <p className="text-slate-400 text-xs mt-2 font-medium">Native Peer-to-Peer Relay</p>
              </div>
            </div>
          </section>
        </div>

        {/* Intelligence Pillar */}
        <div className="lg:col-span-7 space-y-8">
          <section className="glass-card rounded-[2.5rem] p-10 shadow-2xl shadow-indigo-100/30 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">Stream Insights</h2>
                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Active Processing Nodes</p>
              </div>
              <div className="flex -space-x-3">
                <div className="w-10 h-10 rounded-full border-2 border-white bg-slate-900 flex items-center justify-center text-white">
                  <Icon name="user" className="w-5 h-5" />
                </div>
                <div className="w-10 h-10 rounded-full border-2 border-white bg-indigo-600 flex items-center justify-center text-[10px] text-white font-bold">AI</div>
              </div>
            </div>

            {transfers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 py-20">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-slate-100 rounded-full radar-pulse"></div>
                  <Icon name="file" className="w-16 h-16 relative z-10" />
                </div>
                <p className="font-bold tracking-tight text-slate-400">Awaiting stream input...</p>
              </div>
            ) : (
              <div className="space-y-6 overflow-y-auto max-h-[700px] pr-2 custom-scrollbar">
                {transfers.map((t) => (
                  <div key={t.id} className="bg-white/80 border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-5 mb-6">
                      <div className={`p-4 rounded-2xl ${t.direction === 'outgoing' ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white'} shadow-lg`}>
                        <Icon name={t.direction === 'outgoing' ? 'send' : 'receive'} className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-bold text-slate-800 truncate text-lg tracking-tight">{t.name}</h3>
                          <span className="text-xs font-black text-slate-400">{(t.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t.direction} stream</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                            {t.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden mb-6">
                      <div className={`absolute inset-0 transition-all duration-500 ${t.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${t.progress}%` }}></div>
                    </div>

                    {t.geminiAnalysis && (
                      <div className="bg-slate-900 rounded-[1.5rem] p-6 flex gap-4 items-start relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 rotate-12 transition-transform group-hover:rotate-45">
                           <Icon name="sparkles" className="w-12 h-12" />
                        </div>
                        <div className="w-10 h-10 rounded-full border border-white/20 bg-indigo-500 flex items-center justify-center text-white shrink-0 mt-1">
                          <Icon name="sparkles" className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                             <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Umer AI Assistant</span>
                             <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                             <span className="text-[10px] font-bold text-slate-500">Processing Node #01</span>
                          </div>
                          <p className="text-sm text-slate-300 font-medium leading-relaxed italic">"{t.geminiAnalysis}"</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Enhanced Footer with Developer Info */}
      <footer className="mt-20 w-full max-w-5xl px-4 pb-20">
        <div className="glass-card rounded-[2rem] p-8 md:p-12 shadow-xl shadow-slate-200/50 flex flex-col items-center text-center">
          <div className="mb-6 flex items-center gap-2 text-indigo-600">
            <Icon name="sparkles" className="w-6 h-6" />
            <h3 className="text-lg font-bold tracking-tight">Protocol Mastery</h3>
          </div>
          
          <div className="max-w-2xl mb-8">
            <p className="text-slate-600 font-medium leading-relaxed">
              This app is built by <span className="text-slate-900 font-extrabold">Umer Mushtaq Mir</span>. 
              Engineered for high-performance peer-to-peer data distribution with zero-knowledge architecture.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-slate-200">
              <span className="text-indigo-400">Contact:</span>
              <a href="mailto:bcaumer96@gmail.com" className="hover:underline transition-all underline-offset-4">bcaumer96@gmail.com</a>
            </div>
          </div>

          <div className="w-full h-px bg-slate-200/50 mb-8"></div>

          <div className="w-full flex flex-col md:flex-row items-center justify-between gap-6 opacity-60">
            <div className="flex items-center gap-8 text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
              <span className="flex items-center gap-2">
                <Icon name="shield" className="w-3 h-3" />
                Military Grade P2P
              </span>
              <span className="flex items-center gap-2">
                <Icon name="sparkles" className="w-3 h-3" />
                Gemini Flash Core
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
              <span>&copy; 2025 UmerShare Digital</span>
              <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
              <span className="text-indigo-600">Secure Protocol v2.5</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
