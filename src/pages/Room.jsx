import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSignaling } from '../hooks/useSignaling';
import { Loader2, Wifi, WifiOff } from 'lucide-react';

export default function Room({ session }) {
  const { roomId } = useParams();
  // If no session (viewer), use a random ID for now
  const userId = session?.user?.id || `viewer-${Math.random().toString(36).substr(2, 9)}`;

  const { connectionStatus, sendSignal, messages } = useSignaling(roomId, userId);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h1 className="text-xl font-bold">Room Monitor</h1>
            <p className="text-xs text-gray-400 font-mono">{roomId}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
            connectionStatus === 'SUBSCRIBED' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
          }`}>
            {connectionStatus === 'SUBSCRIBED' ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connectionStatus}
          </div>
        </div>

        {/* Test Controls */}
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Signaling Test</h2>
          <p className="mb-6 text-sm text-gray-300">
            Open this URL in a second tab/device. Click the button below to send a "Ping" signal.
            You should see it appear in the other window's log.
          </p>

          <button
            onClick={() => sendSignal('PING', { timestamp: Date.now() })}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium hover:bg-blue-700 transition"
          >
            Send Test Signal (PING)
          </button>
        </div>

        {/* Log Output */}
        <div className="rounded-lg bg-black p-4 font-mono text-xs text-green-400 h-64 overflow-y-auto border border-gray-800">
          {messages.length === 0 && <span className="text-gray-600">Waiting for signals...</span>}
          {messages.map((msg, i) => (
            <div key={i} className="mb-1 border-b border-gray-900 pb-1">{msg}</div>
          ))}
        </div>
      </div>
    </div>
  );
}