/**
 * Type-level checks of the contract.
 *
 * They are ordinary `expectTypeOf` assertions, so `pnpm typecheck` fails when a
 * generic stops flowing where it should. The negative cases are written as
 * conditional types rather than as `@ts-expect-error`, because a conditional
 * type is checked wherever the file is type-checked, whatever the formatter does
 * to the line it sits on.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type {
  InboxAdapter,
  InboxCountQuery,
  InboxListQuery,
  InboxMarkAllReadResult,
  InboxReadStatusQuery,
  InboxReadStatusResult,
} from './adapter';
import type { InboxActions, InboxCallbacks } from './controller';
import type { InboxContext, InboxNotification, InboxPage } from './types';

interface OrderData {
  orderId: number;
}

interface ChatData {
  roomId: string;
}

interface WorkspaceContextData {
  tenant: string;
}

/** `true` when the first type is accepted where the second is expected. */
type Assignable<From, To> = From extends To ? true : false;

/** `true` only for `any`; every other type — `unknown` included — is `false`. */
type IsAny<Value> = 0 extends 1 & Value ? true : false;

declare const ordersAdapter: InboxAdapter<OrderData, WorkspaceContextData>;
declare const chatAdapter: InboxAdapter<ChatData>;
declare const actions: InboxActions<OrderData, WorkspaceContextData>;

describe('the notification generic', () => {
  it('defaults to unknown rather than any', () => {
    expectTypeOf<InboxNotification['data']>().toBeUnknown();
    expectTypeOf<IsAny<InboxNotification['data']>>().toEqualTypeOf<false>();
  });

  it('carries the application data of one adapter', () => {
    expectTypeOf<InboxNotification<OrderData>['data']>().toEqualTypeOf<OrderData | undefined>();
  });

  it('keeps the cursor opaque but nullable', () => {
    expectTypeOf<InboxPage['nextCursor']>().toEqualTypeOf<string | null>();
  });
});

describe('the adapter generic', () => {
  it('sends the context data it was declared with', () => {
    expectTypeOf<Parameters<typeof ordersAdapter.getNotifications>[0]>().toEqualTypeOf<
      InboxListQuery<WorkspaceContextData>
    >();
    expectTypeOf<Parameters<typeof ordersAdapter.getUnreadCount>[0]>().toEqualTypeOf<
      InboxCountQuery<WorkspaceContextData>
    >();
  });

  it('answers in the notification data it was declared with', () => {
    expectTypeOf<Awaited<ReturnType<typeof ordersAdapter.getNotifications>>>().toEqualTypeOf<
      InboxPage<OrderData>
    >();
    expectTypeOf<Awaited<ReturnType<typeof ordersAdapter.setReadStatus>>>().toEqualTypeOf<
      InboxReadStatusResult<OrderData>
    >();
    expectTypeOf<
      Awaited<ReturnType<typeof ordersAdapter.markAllRead>>
    >().toEqualTypeOf<InboxMarkAllReadResult>();
  });

  it('keeps two adapters apart', () => {
    expectTypeOf<Awaited<ReturnType<typeof chatAdapter.getNotifications>>>().toEqualTypeOf<
      InboxPage<ChatData>
    >();
    expectTypeOf<
      Assignable<
        Awaited<ReturnType<typeof chatAdapter.getNotifications>>,
        Awaited<ReturnType<typeof ordersAdapter.getNotifications>>
      >
    >().toEqualTypeOf<false>();
  });

  it('requires a signal so a superseded load can be abandoned', () => {
    type WithoutSignal = {
      context: InboxContext<WorkspaceContextData>;
      filter: 'all';
      cursor: null;
    };

    expectTypeOf<
      Assignable<WithoutSignal, InboxListQuery<WorkspaceContextData>>
    >().toEqualTypeOf<false>();
  });

  it('asks for a desired state, not for a toggle command', () => {
    type WithToggleCommand = {
      context: InboxContext<WorkspaceContextData>;
      id: string;
      read: 'toggle';
    };
    type WithDesiredState = {
      context: InboxContext<WorkspaceContextData>;
      id: string;
      read: boolean;
    };

    expectTypeOf<
      Assignable<WithToggleCommand, InboxReadStatusQuery<WorkspaceContextData>>
    >().toEqualTypeOf<false>();
    expectTypeOf<
      Assignable<WithDesiredState, InboxReadStatusQuery<WorkspaceContextData>>
    >().toEqualTypeOf<true>();
  });

  it('keeps the optional invalidation subscription optional', () => {
    type WithoutSubscription = {
      getNotifications: InboxAdapter['getNotifications'];
      getUnreadCount: InboxAdapter['getUnreadCount'];
      setReadStatus: InboxAdapter['setReadStatus'];
      markAllRead: InboxAdapter['markAllRead'];
    };

    expectTypeOf<Assignable<WithoutSubscription, InboxAdapter>>().toEqualTypeOf<true>();
  });
});

describe('the controller vocabulary', () => {
  it('types the context an application may swap in', () => {
    expectTypeOf<Parameters<typeof actions.setContext>[0]>().toEqualTypeOf<
      InboxContext<WorkspaceContextData>
    >();
  });

  it('types the read action as a state change that never rejects', () => {
    expectTypeOf<Parameters<typeof actions.setRead>>().toEqualTypeOf<[string, boolean]>();
    expectTypeOf<ReturnType<typeof actions.setRead>>().toEqualTypeOf<Promise<void>>();
  });

  it('types the callbacks with the same application data', () => {
    type Click = NonNullable<InboxCallbacks<OrderData>['onNotificationClick']>;

    expectTypeOf<Parameters<Click>[0]>().toEqualTypeOf<InboxNotification<OrderData>>();
  });
});
