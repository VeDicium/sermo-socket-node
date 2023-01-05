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
