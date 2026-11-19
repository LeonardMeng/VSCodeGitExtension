import type { FromWebviewMessage, ToWebviewMessage } from '@shared/protocol/types';

export type RequestFn = <T extends ToWebviewMessage>(
  build: (requestId: number) => FromWebviewMessage,
  expected: Array<T['type']>
) => Promise<T>;

export type PushToast = (level: 'info' | 'warn' | 'error', message: string) => void;
