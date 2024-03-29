import net from 'net';
import EventEmitter from 'eventemitter3';
import SimpleCustomErrors from 'simple-custom-errors';

export const SermoSocketErrors = SimpleCustomErrors.createError('SermoSocketErrors', [
  {
    code: 'Timeout',
    description: 'Request timed out',
    params: ['requestId'],
    http: {
      statusCode: 408,
    },
    sentry: false,
  },
  {
    code: 'RequestError',
    description: '{{message}}',
    params: ['url', 'code', 'data', 'message'],
    sentry: false,
  }
]);

export interface SermoSocketOptions {
  socket: net.NetConnectOpts;
  reconnect?: boolean;
  endByte?: number;
}

export type RequestMethod = 'get' | 'GET' | 'post' | 'POST' | 'put' | 'PUT' | 'patch' | 'PATCH' | 'delete' | 'DELETE';

export interface RequestOptions {
  headers?: any;
  query?: any;
  body?: any;
  timeout?: number;
}

export interface Request {
  method: RequestMethod;
  url: string;
  headers?: any;
  query?: any;
  body?: any;
  requestId: string;
}

export interface PendingRequest {
  resolve: Function;
  reject: Function;
  timeout: NodeJS.Timeout;
  requestId: string;
}

export type ResponseType = 'request' | 'REQUEST' | 'push' | 'PUSH';

export interface Response {
  type: ResponseType;
  url: string;
  code: number;
  data?: any;
  requestId: string;
}

export class SermoSocket {
  options: SermoSocketOptions;

  socket = null as null | net.Socket;
  state = null as null | boolean;
  lastMessage = null as null | number;

  __reconnectTimeout = null as null | NodeJS.Timeout;
  __reconnectCount = 0;
  __pendingRequest = {} as Record<string, PendingRequest>;
  __emitter = new EventEmitter();
  __buffer = [] as Array<number>;

  constructor (options: SermoSocketOptions) {
    this.options = options;

    // Default reconnect is true
    this.options.reconnect = (typeof this.options.reconnect === 'boolean' ? this.options.reconnect : true);

    // Default end byte is 0x0A
    this.options.endByte = (this.options.endByte || 0x0A);
  }

  init (socket: net.Socket): SermoSocket {
    // Disconnect old socket
    this.disconnect();

    // Set socket
    this.socket = socket;
    this.__buffer = [];

    // Listeners
    this.socket.on('connect', this.__onConnect.bind(this));
    this.socket.on('data', this.__onData.bind(this));
    this.socket.on('error', this.__onError.bind(this));
    this.socket.on('end', this.__onEnd.bind(this));

    return this;
  }

  connect (): SermoSocket {
    const socket = net.createConnection(this.options.socket);
    return this.init(socket);
  }

  disconnect (): void {
    if (!this.socket) {
      return;
    }

    // Remove listeners
    this.socket.off('connect', this.__onConnect.bind(this));
    this.socket.off('data', this.__onData.bind(this));
    this.socket.off('error', this.__onError.bind(this));
    this.socket.off('end', this.__onEnd.bind(this));

    // Set state back to null
    this.state = null;
    this.lastMessage = null;
    this.__buffer = [];

    // Destroy connection with socket
    this.socket.destroy();
  }

  reconnect (): void {
    if (this.__reconnectTimeout) {
      return;
    }

    // Disconnect
    this.disconnect();

    // Retry connection
    let timeout = 100;
    if (this.__reconnectCount > 200) timeout = 10000;
    else if (this.__reconnectCount > 150) timeout = 5000;
    else if (this.__reconnectCount > 100) timeout = 2000;
    else if (this.__reconnectCount > 50) timeout = 1000;
    else if (this.__reconnectCount > 20) timeout = 500;

    this.__reconnectTimeout = setTimeout(() => {
      // Clear timeout
      clearTimeout(this.__reconnectTimeout as NodeJS.Timeout);
      this.__reconnectTimeout = null;
      this.__reconnectCount++;

      // Try to connect again, this will trigger a reconnect if failed to connect
      this.connect();
    }, timeout);
  }

  async request (method: RequestMethod = 'GET', url: string, options?: RequestOptions): Promise<Response> {
    const request: Request = {
      method: method.toUpperCase() as RequestMethod,
      url: url,
      requestId: String(Math.random()),
    };

    if (options?.headers) request.headers = options.headers;
    if (options?.query) request.query = options.query;
    if (options?.body) request.body = options.body;

    // Cancel request if socket is offline
    if (!this.socket || this.online === false) {
      throw new Error('Socket offline');
    }

    // Create request
    return new Promise((resolve, reject) => {
      const buffer = Buffer.concat([
        Buffer.from(JSON.stringify(request)),
        Buffer.from([this.options.endByte]),
      ]);
      this.socket?.write(buffer);

      // Create pending request
      const timeout = setTimeout(() => reject(new SermoSocketErrors('Timeout', { requestId: request.requestId })), (options?.timeout || 5000));
      this.__pendingRequest[request.requestId] = { resolve, reject, timeout, requestId: request.requestId };
    });
  }

  async get (url: string, options?: RequestOptions): Promise<Response> {
    return this.request('GET', url, options);
  }

  async post (url: string, options?: RequestOptions): Promise<Response> {
    return this.request('POST', url, options);
  }

  async put (url: string, options?: RequestOptions): Promise<Response> {
    return this.request('PUT', url, options);
  }

  async patch (url: string, options?: RequestOptions): Promise<Response> {
    return this.request('PATCH', url, options);
  }

  async delete (url: string, options?: RequestOptions): Promise<Response> {
    return this.request('DELETE', url, options);
  }

  // Map EventEmitter 'on' & 'once'
  on (event: string, fn: (...args: any[]) => void) {
    return this.__emitter.on(event, fn);
  }

  once (event: string, fn: (...args: any[]) => void) {
    return this.__emitter.once(event, fn);
  }

  // Getter & Setters
  get online (): boolean {
    return this.state === true;
  }

  // Private functions
  __onMessage (): void {
    this.lastMessage = new Date().getTime();
  }

  __onStateChange (state: boolean): void {
    if (this.state === state) {
      return;
    }

    // On connect
    if (state === true) {
      // Nothing to do here (yet)
    }

    if (state === false) {
      // Only trigger when state was connected first
      if (this.state === true) this.__emitter.emit('disconnect');

      // Trigger reconnect if state changed to false (if not disabled)
      if (this.options.reconnect !== false) this.reconnect();

      // Throw error on all pending requests
      Object.keys(this.__pendingRequest).forEach((requestId) => {
        this.__pendingRequest[requestId].reject(new SermoSocketErrors('Timeout', { requestId }));
      });
    }

    // State has changed
    this.__emitter.emit('state-change', state, this.state);
    this.state = state;

    // Emit connect after setting state, because else the offline error will cause problems
    if (state === true) {
      this.__emitter.emit('connect');
    }
  }

  __onConnect (): void {
    this.__reconnectCount = 0;
    this.__onStateChange(true);
    this.__onMessage();
  }

  __onData (data: Buffer): void {
    // Split data by end byte
    const messages = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== this.options.endByte) {
        this.__buffer.push(data[i]);
      } else {
        messages.push(Buffer.from(this.__buffer));
        this.__buffer = [];
      }
    }

    messages.forEach((messageBuffer: Buffer) => {
      let message = {} as Response;
      try {
        message = JSON.parse(messageBuffer.toString()) as Response;
      } catch (e) {
        return;
      }

      // Update last message
      this.__onMessage();

      // Push request
      if (message.type.toUpperCase() === 'PUSH') {
        this.__emitter.emit('push', message);
        this.__emitter.emit(message.url, message);
      }

      // Response on request
      if (message.type.toUpperCase() === 'REQUEST' && this.__pendingRequest[message.requestId]) {
        clearTimeout(this.__pendingRequest[message.requestId].timeout);
        if (message.code === 200) {
          this.__pendingRequest[message.requestId].resolve(message);
        } else {
          this.__pendingRequest[message.requestId].reject(new SermoSocketErrors('RequestError', {
            url: message.url,
            code: message.code,
            data: message.data,
            message: message.data.error
          }));
        }

        delete this.__pendingRequest[message.requestId];
      }
    });
  }

  __onError (err: Error): void {
    this.__onStateChange(false);
    this.__emitter.emit('error', err);
  }

  __onEnd (): void {
    this.__onStateChange(false);
  }
}

export default SermoSocket;
