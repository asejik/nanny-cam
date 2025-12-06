import { useEffect, useRef, useState, useCallback } from 'react';

const SERVERS = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
};

export function useWebRTC(roomId, userId, isBroadcaster, sendSignal) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const peerRef = useRef(null);

  // Track if the user explicitly clicked "Start"
  const isLiveRef = useRef(false);

  // 1. Setup Media (For BOTH Broadcaster and Viewer)
  useEffect(() => {
    let stream = null;

    const setupMedia = async () => {
      try {
        if (isBroadcaster) {
            // Broadcaster: Camera + Mic
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
        } else {
            // Viewer: Mic ONLY (for Talkback)
            // We ask for it immediately so it's ready to go
            stream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true,
            });
            // CRITICAL: Mute it by default!
            stream.getAudioTracks().forEach(track => track.enabled = false);
        }
        setLocalStream(stream);
      } catch (err) {
        console.error('Error accessing media:', err);
        // Viewer might deny mic, that's okay, app should still work
        if (isBroadcaster) alert('Could not access camera/mic.');
      }
    };

    setupMedia();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isBroadcaster]);

  // 2. Helper to Toggle Mic (Push-to-Talk)
  const toggleMic = useCallback((isEnabled) => {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = isEnabled;
        });
    }
  }, [localStream]);

  // 3. Create Peer Helper
  const createPeer = useCallback(() => {
    console.log("Creating new RTCPeerConnection");
    const pc = new RTCPeerConnection(SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('candidate', event.candidate);
      }
    };

    pc.ontrack = (event) => {
      console.log('Stream received!', event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    // Add Local Stream (Camera for Broadcaster, Mic for Viewer)
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    return pc;
  }, [localStream, sendSignal]);

  // 4. Start Stream (Manual Trigger)
  const startStream = useCallback(async () => {
    if (!isBroadcaster) return;

    isLiveRef.current = true; // MARK AS LIVE

    if (!peerRef.current) {
        peerRef.current = createPeer();
    }
    const pc = peerRef.current;

    console.log("Creating Offer (Manual Start)...");
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

    // Handle "ready" signal
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

  // 7. Join as Viewer
  useEffect(() => {
    if (!isBroadcaster) {
        const timer = setTimeout(() => {
            sendSignal('ready', {});
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [isBroadcaster, sendSignal]);

  return { localStream, remoteStream, startStream, stopStream, processSignal, toggleMic };
}