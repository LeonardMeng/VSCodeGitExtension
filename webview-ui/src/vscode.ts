import type { FromWebviewMessage, ToWebviewMessage } from '@shared/protocol/types';
import { createMockBridge } from './mock/mockBridge';

export interface Bridge {
  post(message: FromWebviewMessage): void;
  onMessage(handler: (message: ToWebviewMessage) => void): () => void;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const params = new URLSearchParams(window.location.search);
export const isMock = typeof acquireVsCodeApi !== 'function' || params.has('mock');

function createVsCodeBridge(): Bridge {
  const api = acquireVsCodeApi();
  const handlers = new Set<(message: ToWebviewMessage) => void>();
  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as ToWebviewMessage;
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    handlers.forEach((handler) => handler(message));
  });
  return {
    post(message) {
      api.postMessage(message);
    },
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    }
  };
}

export const bridge: Bridge = isMock ? createMockBridge() : createVsCodeBridge();

const listeners = new Set<(message: ToWebviewMessage) => void>();
bridge.onMessage((message) => {
  listeners.forEach((listener) => listener(message));
});

export function onMessage(handler: (message: ToWebviewMessage) => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

export function post(message: FromWebviewMessage): void {
  bridge.post(message);
}

let requestCounter = 0;
export function nextRequestId(): number {
  requestCounter += 1;
  return requestCounter;
}

export function persistState(value: unknown): void {
  if (isMock) {
    try {
      localStorage.setItem('forkgit.webview', JSON.stringify(value));
    } catch {
      // ignore
    }
  }
}
