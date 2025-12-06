import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useSignaling(roomId, userId) {
  const channelRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]);

  // Keep track of mounting to prevent updates after user leaves page
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (!roomId) return;

    const topic = `room:${roomId}`;
    let retryTimer = null;

    const connect = async () => {
      // 1. Cleanup specific existing channel if it exists locally
      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
      }

      console.log(`[Signaling] Connecting to ${topic}...`);
      setConnectionStatus('CONNECTING');

      // 2. Create Channel
      const channel = supabase.channel(topic, {
        config: { broadcast: { self: false } },
      });

      // 3. Subscribe with Retry Logic
      channel.subscribe((status, err) => {
        if (!isMounted.current) return;

        console.log(`[Supabase] Status: ${status}`);
        setConnectionStatus(status);

        if (status === 'SUBSCRIBED') {
          // Success! Clear any pending retries
          if (retryTimer) clearTimeout(retryTimer);
        } else if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          // Failure! Retry in 3 seconds
          if (err) console.error('Channel Error:', err);

          console.log('[Signaling] Connection failed. Retrying in 3s...');
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            if (isMounted.current) connect();
          }, 3000);
        }
      });

      channelRef.current = channel;
    };

    // Start the connection loop
    connect();

    // Cleanup on Unmount
    return () => {
      isMounted.current = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (channelRef.current) {
        console.log('[Signaling] Unmounting - cleaning up.');
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [roomId]);

  const sendSignal = useCallback(async (type, data) => {
    // Only send if we are actively subscribed
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
      // console.log(`Signal sent: ${type}`);
    } catch (err) {
      console.error('Signal send failed:', err);
    }
  }, [userId, connectionStatus]);

  return { connectionStatus, sendSignal, messages };
}