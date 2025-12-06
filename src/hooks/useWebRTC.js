import { useEffect, useRef, useState, useCallback } from 'react';

const SERVERS = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
};

export function useWebRTC(roomId, userId, isBroadcaster, sendSignal, connectionStatus) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const peerRef = useRef(null);
  const isLiveRef = useRef(false);

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

    if (!peerRef.current) peerRef.current = createPeer();
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
            console.log("Viewer ready. Renegotiating...");
            if (peerRef.current) {
                peerRef.current.close();
                peerRef.current = null;
            }
            startStream();
        }
        return;
    }

    if (!peerRef.current && type === 'offer' && !isBroadcaster) {
        peerRef.current = createPeer();
    }
    const pc = peerRef.current;
    if (!pc) return;

    try {
      if (type === 'offer') {
        if (isBroadcaster) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('answer', answer);
      } else if (type === 'answer') {
        if (!isBroadcaster) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (type === 'candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(data));
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
  }, []);

  // 7. Manual Connect Helper (NEW)
  const connectToStream = useCallback(() => {
    if (!isBroadcaster && connectionStatus === 'SUBSCRIBED') {
        console.log("Manual Connect: Sending READY signal...");
        sendSignal('ready', {});
    }
  }, [isBroadcaster, connectionStatus, sendSignal]);

  // We removed the automatic useEffect. Now we wait for the user to click.

  return { localStream, remoteStream, startStream, stopStream, processSignal, toggleMic, connectToStream };
}