import type {
  InboxInitialData,
  InboxMockAdapter,
  InboxNotification,
} from '@nickkupriyanov/inboxline-core';

export const FIXED_NOW: number;
export const CONTEXT: { key: string };
export const NOTIFICATIONS: readonly InboxNotification[];
export function createSeed(): InboxInitialData;
export function createAdapter(): InboxMockAdapter;
