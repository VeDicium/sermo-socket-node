import net from 'net';
import EventEmitter from 'eventemitter3';

export interface SermoSocketOptions {
  socket: net.NetConnectOpts;
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

  __reconnectTimeout = null as null | NodeJS.Timeout;
  __reconnectCount = 0;
  __pendingRequest = {} as Record<string, PendingRequest>;
  __emitter = new EventEmitter();

  constructor (options: SermoSocketOptions) {
    this.options = options;

    // Default end byte is 0x0A
    this.options.endByte = (this.options.endByte || 0x0A);
  }

  init (socket: net.Socket): SermoSocket {
    // Disconnect old socket
    this.disconnect();

    // Set socket
    this.socket = socket;

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
      const timeout = setTimeout(() => reject({ type: 'timeout', requestId: request.requestId }), (options?.timeout || 5000));
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

  // Map EventEmitter 'on'
  on (event: string, fn: (...args: any[]) => void) {
    return this.__emitter.on(event, fn);
  }

  // Getter & Setters
  get online (): boolean {
    return this.state === true;
  }

  // Private functions
  __onStateChange (state: boolean): void {
    if (this.state === state) {
      return;
    }

    // Trigger reconnect if state changed to false
    if (state === false) {
      this.reconnect();
    }

    // State has changed
    this.state = state;
  }

  __onConnect (): void {
    this.__reconnectCount = 0;
    this.__onStateChange(true);
  }

  __onData (data: Buffer): void {
    // Split data by end byte
    const messages = [];
    let buff = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== this.options.endByte) {
        buff.push(data[i]);
      } else {
        messages.push(Buffer.from(buff));
        buff = [];
      }
    }

    messages.forEach((messageBuffer: Buffer) => {
      let message = {} as Response;
      try {
        message = JSON.parse(messageBuffer.toString()) as Response;
      } catch (e) {
        return;
      }

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
          this.__pendingRequest[message.requestId].reject(message);
        }

        delete this.__pendingRequest[message.requestId];
      }
    });
  }

  __onError (_err: Error): void {
    this.__onStateChange(false);
  }

  __onEnd (): void {
    this.__onStateChange(false);
  }
}

export default SermoSocket;
