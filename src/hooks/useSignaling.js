import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useSignaling(roomId, userId) {
  const channelRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]); // For debugging log

  useEffect(() => {
    if (!roomId) return;

    // 1. Create the channel (Unique to this room)
    const channel = supabase.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: false }, // Don't receive our own messages
        presence: { key: userId },   // Track who is online
      },
    });

    // 2. Setup Event Listeners
    channel
      .on('broadcast', { event: 'signal' }, (payload) => {
        console.log('📡 Received Signal:', payload.payload.type);
        setMessages((prev) => [...prev, `Rx: ${payload.payload.type}`]);
        // Future: We will pass this payload to WebRTC here
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('👥 Users in room:', state);
        setMessages((prev) => [...prev, `Presence Update: ${Object.keys(state).length} users`]);
      })
      .subscribe((status) => {
        console.log('Subscription status:', status);
        setConnectionStatus(status);
      });

    channelRef.current = channel;

    // Cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, userId]);

  // Function to send messages to the other peer
  const sendSignal = async (type, data) => {
    if (!channelRef.current) return;

    console.log('📤 Sending Signal:', type);
    setMessages((prev) => [...prev, `Tx: ${type}`]);

    await channelRef.current.send({
      type: 'broadcast',
      event: 'signal',
      payload: { type, data, sender: userId },
    });
  };

  return { connectionStatus, sendSignal, messages };
}