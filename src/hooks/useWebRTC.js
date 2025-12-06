import { useEffect, useRef, useState, useCallback } from 'react';

// FIX 1: More Robust STUN Server List
const SERVERS = {
  iceServers: [
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
};

export function useWebRTC(roomId, userId, isBroadcaster, sendSignal, connectionStatus) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const peerRef = useRef(null);
  const isLiveRef = useRef(false);

  // FIX 2: Create a Queue for early ICE candidates
  const candidateQueue = useRef([]);

  // 1. Setup Media
  useEffect(() => {
    let stream = null;
    const setupMedia = async () => {
      try {
        if (isBroadcaster) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } else {
            // Viewer: Mic only (muted by default)
            stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            stream.getAudioTracks().forEach(track => track.enabled = false);
        }
        setLocalStream(stream);
      } catch (err) {
        console.error('Error accessing media:', err);
      }
    };
    setupMedia();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [isBroadcaster]);

  // 2. Toggle Mic
  const toggleMic = useCallback((isEnabled) => {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = isEnabled);
    }
  }, [localStream]);

  // 3. Create Peer
  const createPeer = useCallback(() => {
    console.log("Creating new RTCPeerConnection");
    const pc = new RTCPeerConnection(SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal('candidate', event.candidate);
    };

    pc.ontrack = (event) => {
      console.log('Stream received!', event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    return pc;
  }, [localStream, sendSignal]);

  // 4. Start Stream
  const startStream = useCallback(async () => {
    if (!isBroadcaster) return;
    isLiveRef.current = true;

    if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
    }
    peerRef.current = createPeer();
    const pc = peerRef.current;

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal('offer', offer);
    } catch (err) {
        console.error("Error creating offer:", err);
    }
  }, [isBroadcaster, sendSignal, createPeer]);

  // 5. Process Signals (THE BIG FIX)
  const processSignal = useCallback(async (type, data, senderId) => {
    if (senderId === userId) return;

    // Handle "ready" signal
    if (type === 'ready' && isBroadcaster) {
        if (isLiveRef.current) {
            console.log("Viewer ready. Restarting Stream...");
            startStream();
        }
        return;
    }

    // Handle Offer
    if (type === 'offer' && !isBroadcaster) {
        if (peerRef.current) {
             peerRef.current.close();
             peerRef.current = null;
        }
        peerRef.current = createPeer();
        // Clear queue on new connection
        candidateQueue.current = [];
    }

    const pc = peerRef.current;
    if (!pc && type !== 'offer') return; // Ignore candidates if no peer exists yet

    try {
      if (type === 'offer') {
        if (isBroadcaster) return;
        console.log("Processing Offer...");
        await pc.setRemoteDescription(new RTCSessionDescription(data));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('answer', answer);

        // FLUSH QUEUE: Process any candidates that arrived early
        while (candidateQueue.current.length > 0) {
            const candidate = candidateQueue.current.shift();
            console.log("Flushing buffered candidate");
            await pc.addIceCandidate(candidate);
        }

      } else if (type === 'answer') {
        if (!isBroadcaster) return;
        console.log("Processing Answer...");
        await pc.setRemoteDescription(new RTCSessionDescription(data));

        // FLUSH QUEUE for Broadcaster too
        while (candidateQueue.current.length > 0) {
            const candidate = candidateQueue.current.shift();
            await pc.addIceCandidate(candidate);
        }

      } else if (type === 'candidate') {
        const candidate = new RTCIceCandidate(data);

        // CHECK: Is remote description set?
        if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(candidate);
        } else {
            // BUFFER: Save it for later
            console.log("Buffering early candidate...");
            candidateQueue.current.push(candidate);
        }
      }
    } catch (err) {
      console.error('Error processing signal:', err);
    }
  }, [isBroadcaster, sendSignal, userId, createPeer, startStream]);

  // 6. Stop Stream
  const stopStream = useCallback(() => {
    isLiveRef.current = false;
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    candidateQueue.current = [];
  }, []);

  // 7. Manual Connect Helper
  const connectToStream = useCallback(() => {
    if (!isBroadcaster && connectionStatus === 'SUBSCRIBED') {
        console.log("Manual Connect: Resetting PC and sending READY...");
        if (peerRef.current) {
            peerRef.current.close();
            peerRef.current = null;
        }
        candidateQueue.current = [];
        sendSignal('ready', {});
    }
  }, [isBroadcaster, connectionStatus, sendSignal]);

  return { localStream, remoteStream, startStream, stopStream, processSignal, toggleMic, connectToStream };
}