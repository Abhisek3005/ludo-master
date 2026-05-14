import React from 'react';

import { onlineSession } from 'online/session';
import { IOnlineRoom, IVoicePairSignal } from 'online/types';

import styles from './Container.module.css';

interface IProps {
  room: IOnlineRoom | null;
}

interface IState {
  enabled: boolean;
  muted: boolean;
  error: string;
  remoteCount: number;
}

interface IPeerEntry {
  connection: RTCPeerConnection;
  remoteAudio: HTMLAudioElement;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export class VoiceChat extends React.PureComponent<IProps, IState> {
  public state: IState = {
    enabled: false,
    error: '',
    muted: false,
    remoteCount: 0,
  };

  private localStream: MediaStream | null = null;
  private peers: { [playerID: string]: IPeerEntry } = {};
  private processedCandidates: { [candidateKey: string]: boolean } = {};

  public componentDidUpdate(prevProps: IProps) {
    if (this.state.enabled && prevProps.room !== this.props.room) {
      this.syncPeers();
    }
  }

  public componentWillUnmount() {
    this.stopVoice();
  }

  public render() {
    const { enabled, error, muted, remoteCount } = this.state;
    return (
      <div className={styles.VoiceBox}>
        <button className={styles.SmallButton} onClick={enabled ? this.stopVoice : this.startVoice}>
          {enabled ? 'Voice Off' : 'Voice On'}
        </button>
        {
          enabled
          ? <button className={styles.SmallButton} onClick={this.toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          : null
        }
        <span className={styles.VoiceText}>{enabled ? `Voice connected: ${remoteCount}` : 'Voice is off'}</span>
        {error ? <div className={styles.ErrorText}>{error}</div> : null}
      </div>
    );
  }

  private startVoice = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser microphone API not available. Use Chrome/Edge on HTTPS or localhost.');
      }
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.setState({ enabled: true, error: '' }, this.syncPeers);
    } catch (error) {
      this.setState({ error: (error as Error).message });
    }
  }

  private stopVoice = () => {
    Object.values(this.peers).forEach((entry) => {
      entry.connection.close();
      entry.remoteAudio.remove();
    });
    this.peers = {};
    this.processedCandidates = {};
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.setState({ enabled: false, muted: false, remoteCount: 0 });
  }

  private toggleMute = () => {
    if (!this.localStream) {
      return;
    }
    const muted = !this.state.muted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.setState({ muted });
  }

  private syncPeers = () => {
    const room = this.props.room;
    const localStream = this.localStream;
    if (!room || !localStream) {
      return;
    }
    const localID = onlineSession.getPlayerID();
    const players = Object.values(room.players || {}).filter((player) => player.id !== localID);
    players.forEach((player) => this.ensurePeer(player.id));
    this.applyRemoteSignals(room);
    this.setState({ remoteCount: Object.keys(this.peers).length });
  }

  private ensurePeer = async (remoteID: string) => {
    if (this.peers[remoteID] || !this.localStream) {
      return;
    }
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.localStream.getTracks().forEach((track) => connection.addTrack(track, this.localStream!));
    const remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    (remoteAudio as any).playsInline = true;
    document.body.appendChild(remoteAudio);
    connection.ontrack = (event) => {
      remoteAudio.srcObject = event.streams[0];
    };
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        const pairKey = this.getPairKey(remoteID);
        const candidateID = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        onlineSession.writeVoiceSignal(`${pairKey}/candidates/${onlineSession.getPlayerID()}/${candidateID}`, event.candidate.toJSON());
      }
    };
    this.peers[remoteID] = { connection, remoteAudio };

    if (this.isOfferer(remoteID)) {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await onlineSession.writeVoiceSignal(`${this.getPairKey(remoteID)}/offer`, offer);
      await onlineSession.writeVoiceSignal(`${this.getPairKey(remoteID)}/offerFrom`, onlineSession.getPlayerID());
    }
  }

  private applyRemoteSignals(room: IOnlineRoom) {
    const localID = onlineSession.getPlayerID();
    const voice = room.voice || {};
    Object.keys(this.peers).forEach((remoteID) => {
      const pairKey = this.getPairKey(remoteID);
      const signal = voice[pairKey];
      if (!signal) {
        return;
      }
      this.applyRemoteSignal(remoteID, localID, pairKey, signal);
    });
  }

  private async applyRemoteSignal(remoteID: string, localID: string, pairKey: string, signal: IVoicePairSignal) {
    const entry = this.peers[remoteID];
    if (!entry) {
      return;
    }
    const connection = entry.connection;

    if (signal.offer && signal.offerFrom === remoteID && !connection.remoteDescription) {
      await connection.setRemoteDescription(signal.offer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await onlineSession.writeVoiceSignal(`${pairKey}/answer`, answer);
      await onlineSession.writeVoiceSignal(`${pairKey}/answerFrom`, localID);
    }

    if (signal.answer && signal.answerFrom === remoteID && !connection.remoteDescription) {
      await connection.setRemoteDescription(signal.answer);
    }

    const remoteCandidates = signal.candidates && signal.candidates[remoteID] ? signal.candidates[remoteID] : {};
    await Promise.all(Object.keys(remoteCandidates).map((candidateID) => {
      const key = `${pairKey}_${remoteID}_${candidateID}`;
      if (this.processedCandidates[key]) {
        return Promise.resolve();
      }
      this.processedCandidates[key] = true;
      return connection.addIceCandidate(remoteCandidates[candidateID]);
    }));
  }

  private isOfferer(remoteID: string) {
    return onlineSession.getPlayerID() < remoteID;
  }

  private getPairKey(remoteID: string) {
    return [onlineSession.getPlayerID(), remoteID].sort().join('_');
  }
}
