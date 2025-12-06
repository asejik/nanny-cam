import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSignaling } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import { Video, Monitor, Wifi, Loader2, WifiOff, StopCircle, PlayCircle } from 'lucide-react';

export default function Room({ session }) {
  const { roomId } = useParams();

  const [userId] = useState(() =>
    session?.user?.id || `viewer-${Math.random().toString(36).substr(2, 9)}`
  );

  const [role, setRole] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false); // Track if we are live
  const [isStarting, setIsStarting] = useState(false);   // Track button loading state

  // 1. Signaling Hook
  const { connectionStatus, sendSignal } = useSignaling(roomId, userId);

  // 2. WebRTC Hook
  const { localStream, remoteStream, startStream, stopStream, processSignal } = useWebRTC(
    roomId,
    userId,
    role === 'broadcaster',
    sendSignal
  );

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Attach streams
  useEffect(() => {
    if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // Listen for signals
  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`);
    channel.on('broadcast', { event: 'signal' }, (payload) => {
      processSignal(payload.payload.type, payload.payload.data, payload.payload.sender);
    }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [roomId, processSignal]);

  // Handlers
  const handleStart = async () => {
    setIsStarting(true); // Show spinner immediately
    await startStream();

    // Fake a small delay so the user sees "Starting..."
    setTimeout(() => {
      setIsStreaming(true);
      setIsStarting(false);
    }, 500);
  };

  const handleStop = () => {
    stopStream();
    setIsStreaming(false);
  };

  // --- RENDER ---

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-2xl font-bold text-white">Choose Mode</h1>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => setRole('broadcaster')}
              className="flex flex-col items-center gap-4 rounded-xl bg-blue-600 p-6 text-white transition hover:bg-blue-700"
            >
              <Video size={40} />
              <span className="font-semibold">Broadcaster</span>
            </button>
            <button
              onClick={() => setRole('viewer')}
              className="flex flex-col items-center gap-4 rounded-xl bg-gray-800 p-6 text-white transition hover:bg-gray-700"
            >
              <Monitor size={40} />
              <span className="font-semibold">Viewer</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Broadcaster View
  if (role === 'broadcaster') {
    const isReady = connectionStatus === 'SUBSCRIBED';

    return (
      <div className="min-h-screen bg-black text-white relative">
        <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover absolute inset-0" />

        {/* Status Bar */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
             {isStreaming && <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse"></span>}
             <span className="font-bold">{isStreaming ? 'ON AIR' : 'STANDBY'}</span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${isReady ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {isReady ? <Wifi size={14}/> : <WifiOff size={14}/>}
            {connectionStatus}
          </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center w-full px-4 gap-2">

          {!isStreaming ? (
            // START BUTTON
            <button
              onClick={handleStart}
              disabled={!isReady || isStarting}
              className={`w-full max-w-sm rounded-full py-4 font-bold shadow-lg transition text-lg flex items-center justify-center gap-2
                ${isReady
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
            >
               {isStarting ? (
                 <>
                   <Loader2 className="animate-spin" /> Starting...
                 </>
               ) : !isReady ? (
                 "Connecting..."
               ) : (
                 <>
                   <PlayCircle size={24} /> Start Stream
                 </>
               )}
            </button>
          ) : (
            // STOP BUTTON
            <button
              onClick={handleStop}
              className="w-full max-w-sm rounded-full py-4 font-bold shadow-lg transition text-lg flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
            >
               <StopCircle size={24} /> Stop Stream
            </button>
          )}

        </div>
      </div>
    );
  }

  // Viewer View
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-gray-800">
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 gap-2">
             <Loader2 className="animate-spin" />
             <p>Waiting for live stream...</p>
          </div>
        )}
        <video ref={remoteVideoRef} autoPlay playsInline controls className="h-full w-full object-contain" />
      </div>
      <div className="mt-4 flex items-center gap-2 text-gray-400 text-sm">
        <Wifi size={14} /> Status: <span className="font-mono text-white">{connectionStatus}</span>
      </div>
    </div>
  );
}