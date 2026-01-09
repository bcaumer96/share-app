
export interface Peer {
  id: string;
  name: string;
  connected: boolean;
}

export interface FileTransfer {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'error';
  direction: 'incoming' | 'outgoing';
  geminiAnalysis?: string;
}

export type ConnectionState = 'idle' | 'offering' | 'answering' | 'connected';
