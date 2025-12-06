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

  // 1. Setup Media (Broadcaster Only)
  useEffect(() => {
    if (!isBroadcaster) return;

    let stream = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
      } catch (err) {
        console.error('Error accessing camera:', err);
        alert('Could not access camera.');
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isBroadcaster]);

  // 2. Create Peer Helper
  const createPeer = useCallback(() => {
    console.log("Creating new RTCPeerConnection");
    const pc = new RTCPeerConnection(SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('candidate', event.candidate);
      }
    };

    pc.ontrack = (event) => {
      console.log('Video stream received!', event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    return pc;
  }, [localStream, sendSignal]);

  // 3. Start Stream (Manual Trigger)
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

  // 4. Process Signals
  const processSignal = useCallback(async (type, data, senderId) => {
    if (senderId === userId) return;

    // HANDLE LATE JOINERS:
    // Only respond to 'ready' if we are ACTUALLY LIVE (User clicked Start)
    if (type === 'ready' && isBroadcaster) {
        if (isLiveRef.current) {
            console.log("Viewer is ready and we are LIVE. Sending offer...");
            // Restart connection to ensure clean state
            if (peerRef.current) {
                peerRef.current.close();
                peerRef.current = null;
            }
            startStream();
        } else {
            console.log("Viewer is ready, but we are NOT live. Ignoring.");
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

  // 5. Stop Stream
  const stopStream = useCallback(() => {
    isLiveRef.current = false; // MARK AS STOPPED

    if (peerRef.current) {
      console.log("Stopping stream...");
      peerRef.current.close();
      peerRef.current = null;
    }
  }, []);

  // 6. Join as Viewer (Keep sending 'ready' signal)
  useEffect(() => {
    if (!isBroadcaster) {
        // Send ready signal immediately
        const timer = setTimeout(() => {
            sendSignal('ready', {});
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [isBroadcaster, sendSignal]);

  return { localStream, remoteStream, startStream, stopStream, processSignal };
}