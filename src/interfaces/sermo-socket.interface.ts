import net from 'net';

export enum SermoSocketState {
  /**
   * When the Socket isn't set up yet.
   */
  INITIALIZING = 'initializing',

  /**
   * When the Socket is connected and has an active connection.
   */
  CONNECTED = 'connected',

  /**
   * When the Socket is disconnected or has an inactive connection.
   */
  DISCONNECTED = 'disconnected',
}

export interface SermoSocketOptions {
  socket: net.NetConnectOpts;
  reconnect?: boolean;
  endByte?: number;
}

export type SermoRequestMethod =
  | 'get'
  | 'GET'
  | 'post'
  | 'POST'
  | 'put'
  | 'PUT'
  | 'patch'
  | 'PATCH'
  | 'delete'
  | 'DELETE';

export interface SermoRequestOptions {
  /**
   * Request headers.
   */
  headers?: Record<string, unknown>;

  /**
   * Request query.
   */
  query?: Record<string, unknown>;

  /**
   * Request body.
   */
  body?: any;

  /**
   * Request timeout (in milliseconds).
   */
  timeout?: number;
}

export interface SermoRequest {
  method: SermoRequestMethod;
  url: string;
  headers?: any;
  query?: any;
  body?: any;
  requestId: string;
}

export interface SermoPendingRequest<T = any, R = SermoResponse<T>> {
  request: SermoRequest;
  timeout: NodeJS.Timeout;
  requestId: string;

  resolve: (value: R | PromiseLike<R>) => void;
  reject: (reason?: any) => void;
}

export type SermoResponseType = 'request' | 'REQUEST' | 'push' | 'PUSH';

export interface SermoResponse<T = any> {
  type: SermoResponseType;
  url: string;
  code: number;
  data?: T;
  requestId: string;
}

export type SermoEvents = {
  /**
   * Triggered when the Socket state has changed.
   *
   * @param state SermoSocketState
   * @param oldState SermoSocketState
   */
  'state-change': (state: SermoSocketState, oldState: SermoSocketState) => void;

  /**
   * Triggered when a push message is received.
   *
   * @param message Message
   */
  push: <T = any, R = SermoResponse<T>>(message: R) => void;

  /**
   * Triggered when Socket is connected succesfully.
   */
  connect: () => void;

  /**
   * Triggered when Socket has disconnected.
   */
  disconnect: () => void;

  /**
   * Triggered on a Socket error.
   *
   * @param err Error
   */
  error: (err?: any) => void;
};
