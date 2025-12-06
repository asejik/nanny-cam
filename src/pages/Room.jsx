import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSignaling } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import { Video, Monitor, Wifi, Loader2, WifiOff, StopCircle, PlayCircle, Mic, Play } from 'lucide-react';

export default function Room({ session }) {
  const { roomId } = useParams();

  const [userId] = useState(() =>
    session?.user?.id || `viewer-${Math.random().toString(36).substr(2, 9)}`
  );

  const [role, setRole] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isTalking, setIsTalking] = useState(false);

  // NEW: Track if the viewer has clicked "Watch"
  const [isRequested, setIsRequested] = useState(false);

  // 1. Signaling Hook
  const { connectionStatus, sendSignal } = useSignaling(roomId, userId);

  // 2. WebRTC Hook
  const { localStream, remoteStream, startStream, stopStream, processSignal, toggleMic, connectToStream } = useWebRTC(
    roomId,
    userId,
    role === 'broadcaster',
    sendSignal,
    connectionStatus
  );

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Attach streams
  useEffect(() => {
    if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteStream) {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
    }
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
    setIsStarting(true);
    await startStream();
    setTimeout(() => {
      setIsStreaming(true);
      setIsStarting(false);
    }, 500);
  };

  const handleStop = () => {
    stopStream();
    setIsStreaming(false);
  };

  // Viewer: Handle "Tap to Watch"
  const handleWatchClick = () => {
    setIsRequested(true); // 1. Update UI immediately
    connectToStream();    // 2. Send 'Ready' signal

    // 3. Force Wake-up Video Element (Solves "Nothing Happens" on iOS)
    if (remoteVideoRef.current) {
        remoteVideoRef.current.play().catch(e => console.log("Autoplay handled:", e));
    }
  };

  const startTalking = () => {
    setIsTalking(true);
    toggleMic(true);
  };

  const stopTalking = () => {
    setIsTalking(false);
    toggleMic(false);
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
        <audio ref={remoteAudioRef} autoPlay />

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
            <button
              onClick={handleStart}
              disabled={!isReady || isStarting}
              className={`w-full max-w-sm rounded-full py-4 font-bold shadow-lg transition text-lg flex items-center justify-center gap-2
                ${isReady
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
            >
               {isStarting ? <><Loader2 className="animate-spin" /> Starting...</> : !isReady ? "Connecting..." : <><PlayCircle size={24} /> Start Stream</>}
            </button>
          ) : (
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
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative">
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-gray-800 flex items-center justify-center">

        {/* VIDEO PLAYER */}
        <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-contain" />

        {/* LOADING STATE */}
        {!remoteStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/80 z-10">
             {connectionStatus === 'SUBSCRIBED' ? (
                !isRequested ? (
                  // 1. SHOW BUTTON INITIALLY
                  <button
                    onClick={handleWatchClick}
                    className="flex flex-col items-center gap-4 group cursor-pointer"
                  >
                    <div className="bg-blue-600 p-4 rounded-full shadow-lg group-hover:scale-110 transition">
                      <Play size={32} fill="white" />
                    </div>
                    <p className="font-semibold text-lg">Tap to Watch</p>
                  </button>
                ) : (
                  // 2. SHOW SPINNER IMMEDIATELY AFTER CLICK
                  <div className="flex flex-col items-center gap-2 text-blue-400">
                    <Loader2 className="animate-spin h-10 w-10" />
                    <p className="font-medium animate-pulse">Requesting Video...</p>
                    <p className="text-xs text-gray-400 mt-2">Connecting to Broadcaster</p>
                  </div>
                )
             ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                   <Loader2 className="animate-spin" />
                   <p>Connecting to room...</p>
                </div>
             )}
          </div>
        )}
      </div>

      {/* Talkback Controls */}
      {remoteStream && (
        <button
          onMouseDown={startTalking}
          onMouseUp={stopTalking}
          onTouchStart={startTalking}
          onTouchEnd={stopTalking}
          className={`mt-8 flex h-20 w-20 items-center justify-center rounded-full border-4 shadow-xl transition-all active:scale-95 select-none
            ${isTalking
              ? 'bg-blue-600 border-blue-400 text-white scale-110 ring-4 ring-blue-500/30'
              : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}
        >
          <Mic size={32} className={isTalking ? 'animate-pulse' : ''} />
        </button>
      )}

      {remoteStream && (
        <p className="mt-4 text-xs text-gray-500 font-medium">Hold to Speak</p>
      )}

      <div className="mt-4 flex items-center gap-2 text-gray-400 text-sm absolute bottom-4 right-4">
        <Wifi size={14} /> Status: <span className="font-mono text-white">{connectionStatus}</span>
      </div>
    </div>
  );
}