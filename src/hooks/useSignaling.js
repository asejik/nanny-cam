import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// NEW: Accept onSignal callback to handle incoming messages
export function useSignaling(roomId, userId, onSignal) {
  const channelRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Use a ref for the callback to prevent effect re-triggering
  const onSignalRef = useRef(onSignal);

  // Update ref whenever the callback changes
  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (!roomId) return;

    const topic = `room:${roomId}`;
    let isMounted = true;

    const connect = async () => {
      // 1. NUCLEAR CLEANUP (Safe now because we own the only connection)
      await supabase.removeAllChannels();

      if (!isMounted) return;

      console.log(`[Signaling] Connecting to ${topic}...`);
      setConnectionStatus('CONNECTING');

      // 2. Create Channel
      const channel = supabase.channel(topic, {
        config: { broadcast: { self: false } },
      });

      // 3. Setup Listener (ON THE SAME CHANNEL)
      channel.on('broadcast', { event: 'signal' }, (payload) => {
          if (onSignalRef.current) {
              onSignalRef.current(payload.payload);
          }
      });

      // 4. Subscribe
      channel.subscribe((status, err) => {
        if (!isMounted) return;
        console.log(`[Supabase] Status: ${status}`);
        setConnectionStatus(status);
      });

      channelRef.current = channel;
    };

    connect();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [roomId]);

  const sendSignal = useCallback(async (type, data) => {
    if (!channelRef.current || connectionStatus !== 'SUBSCRIBED') {
        console.warn('Cannot send signal: Not connected.');
        return;
    }

    try {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type, data, sender: userId },
      });
    } catch (err) {
      console.error('Signal send failed:', err);
    }
  }, [userId, connectionStatus]);

  return { connectionStatus, sendSignal };
}