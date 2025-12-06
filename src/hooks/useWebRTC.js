import { useEffect, useRef, useState, useCallback } from 'react';

const SERVERS = {
  iceServers: [
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
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
  const [iceStatus, setIceStatus] = useState('new');

  // NEW: Debug Logs
  const [logs, setLogs] = useState([]);
  const addLog = (msg) => {
    console.log(`[WebRTC] ${msg}`);
    setLogs(prev => [...prev.slice(-4), msg]); // Keep last 5 logs
  };

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
        addLog("Media acquired");
      } catch (err) {
        addLog(`Media Error: ${err.message}`);
      }
    };
    setupMedia();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [isBroadcaster]);

  // 2. Create Peer
  const createPeer = useCallback(() => {
    addLog("Creating Peer Connection...");
    const pc = new RTCPeerConnection(SERVERS);

    pc.oniceconnectionstatechange = () => {
        setIceStatus(pc.iceConnectionState);
        addLog(`ICE State: ${pc.iceConnectionState}`);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal('candidate', event.candidate);
    };

    pc.ontrack = (event) => {
      addLog("Stream track received!");
      setRemoteStream(event.streams[0]);
    };

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    return pc;
  }, [localStream, sendSignal]);

  // 3. Start Stream
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
        addLog("Creating Offer...");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal('offer', offer);
        addLog("Offer sent.");
    } catch (err) {
        addLog(`Offer Error: ${err.message}`);
    }
  }, [isBroadcaster, sendSignal, createPeer]);

  // 4. Process Signals
  const processSignal = useCallback(async (type, data, senderId) => {
    if (senderId === userId) return;

    // Handle "ready"
    if (type === 'ready' && isBroadcaster) {
        addLog("Received READY from Viewer");
        if (isLiveRef.current) {
            addLog("Restarting Stream...");
            startStream();
        } else {
            addLog("Ignored READY (Not Live)");
        }
        return;
    }

    // Handle Offer
    if (type === 'offer' && !isBroadcaster) {
        addLog("Received OFFER");
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
        addLog("Remote Desc Set");

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('answer', answer);
        addLog("Answer sent");

        while (candidateQueue.current.length > 0) {
            const candidate = candidateQueue.current.shift();
            await pc.addIceCandidate(candidate);
        }

      } else if (type === 'answer') {
        if (!isBroadcaster) return;
        addLog("Received ANSWER");
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
      addLog(`Signal Error: ${err.message}`);
    }
  }, [isBroadcaster, sendSignal, userId, createPeer, startStream]);

  // 5. Connect Helper
  const connectToStream = useCallback(() => {
    if (!isBroadcaster && connectionStatus === 'SUBSCRIBED') {
        addLog("Manual Connect: Sending READY...");
        if (peerRef.current) {
            peerRef.current.close();
            peerRef.current = null;
        }
        candidateQueue.current = [];
        sendSignal('ready', {});
    }
  }, [isBroadcaster, connectionStatus, sendSignal]);

  const toggleMic = useCallback((isEnabled) => {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = isEnabled);
    }
  }, [localStream]);

  const stopStream = useCallback(() => {
    isLiveRef.current = false;
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    candidateQueue.current = [];
  }, []);

  return { localStream, remoteStream, startStream, stopStream, processSignal, toggleMic, connectToStream, iceStatus, logs };
}