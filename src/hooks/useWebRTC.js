import { useEffect, useRef, useState, useCallback } from 'react';

// FIX: Add Free TURN Server (OpenRelay) to bypass Mobile Firewalls
const SERVERS = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
};

export function useWebRTC(roomId, userId, isBroadcaster, sendSignal, connectionStatus) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // NEW: Debug ICE Connection State
  const [iceStatus, setIceStatus] = useState('new');

  const peerRef = useRef(null);
  const isLiveRef = useRef(false);
  const candidateQueue = useRef([]);

  // 1. Setup Media
  useEffect(() => {
    let stream = null;
    const setupMedia = async () => {
      try {
        if (isBroadcaster) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } else {
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
    console.log("Creating new RTCPeerConnection with TURN");
    const pc = new RTCPeerConnection(SERVERS);

    // DEBUG: Track Connection State
    pc.oniceconnectionstatechange = () => {
        console.log("ICE State:", pc.iceConnectionState);
        setIceStatus(pc.iceConnectionState);
    };

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

  // 5. Process Signals
  const processSignal = useCallback(async (type, data, senderId) => {
    if (senderId === userId) return;

    if (type === 'ready' && isBroadcaster) {
        if (isLiveRef.current) {
            console.log("Viewer ready. Restarting Stream...");
            startStream();
        }
        return;
    }

    if (type === 'offer' && !isBroadcaster) {
        if (peerRef.current) {
             peerRef.current.close();
             peerRef.current = null;
        }
        peerRef.current = createPeer();
        candidateQueue.current = [];
    }

    const pc = peerRef.current;
    if (!pc && type !== 'offer') return;

    try {
      if (type === 'offer') {
        if (isBroadcaster) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('answer', answer);

        while (candidateQueue.current.length > 0) {
            const candidate = candidateQueue.current.shift();
            await pc.addIceCandidate(candidate);
        }

      } else if (type === 'answer') {
        if (!isBroadcaster) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        while (candidateQueue.current.length > 0) {
            const candidate = candidateQueue.current.shift();
            await pc.addIceCandidate(candidate);
        }

      } else if (type === 'candidate') {
        const candidate = new RTCIceCandidate(data);
        if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(candidate);
        } else {
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
        if (peerRef.current) {
            peerRef.current.close();
            peerRef.current = null;
        }
        candidateQueue.current = [];
        sendSignal('ready', {});
    }
  }, [isBroadcaster, connectionStatus, sendSignal]);

  // Return iceStatus so we can show it in the UI
  return { localStream, remoteStream, startStream, stopStream, processSignal, toggleMic, connectToStream, iceStatus };
}