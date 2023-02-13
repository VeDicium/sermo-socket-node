import net from 'net';
import EventEmitter from 'eventemitter3';
import {
  SermoPendingRequest,
  SermoRequest,
  SermoRequestMethod,
  SermoRequestOptions,
  SermoResponse,
  SermoSocketOptions,
  SermoSocketState,
  SermoSocketError,
  SermoSocketTimeout,
  SermoSocketRequestError,
  SermoEvents,
} from './interfaces';

export class SermoSocket {
  /**
   * Create a Sermo socket.
   *
   * @param options SermoSocketOptions
   * @returns SermoSocket
   */
  static create(options: SermoSocketOptions): SermoSocket {
    return new SermoSocket(options);
  }

  /**
   * Create a SermoSocket and connect.
   *
   * @param options SermoSocketOptions
   * @returns SermoSocket
   */
  static connect(options: SermoSocketOptions): SermoSocket {
    return this.create(options).connect();
  }

  public options: SermoSocketOptions;
  public socket = undefined as net.Socket | undefined;
  public state: SermoSocketState = SermoSocketState.INITIALIZING;
  public lastMessage = undefined as Date | undefined;

  private reconnectTimeout = undefined as NodeJS.Timeout | undefined;
  private reconnectCount = 0;
  private pendingRequest = new Map<string, SermoPendingRequest>();
  private emitter = new EventEmitter<SermoEvents>();
  private buffer: Array<number> = [];

  constructor(options: SermoSocketOptions) {
    this.options = options;

    // Default reconnect is true
    this.options.reconnect =
      typeof this.options.reconnect === 'boolean'
        ? this.options.reconnect
        : true;

    // Default end byte is 0x0A
    this.options.endByte = this.options.endByte || 0x0a;
  }

  /**
   * Initialize socket.
   *
   * @param socket Socket
   * @returns SermoSocket
   */
  init(socket: net.Socket): SermoSocket {
    // Disconnect old socket
    this.disconnect();

    // Set socket
    this.socket = socket;
    this.buffer = [];

    // Listeners
    this.socket.on('connect', this.onConnect.bind(this));
    this.socket.on('data', this.onData.bind(this));
    this.socket.on('error', this.onError.bind(this));
    this.socket.on('end', this.onEnd.bind(this));

    return this;
  }

  /**
   * Connect to socket.
   *
   * @returns SermoSocket
   */
  connect(): SermoSocket {
    const socket = net.createConnection(this.options.socket);
    return this.init(socket);
  }

  /**
   * Disconnect socket.
   */
  disconnect(): void {
    if (!this.socket) {
      return;
    }

    // Remove listeners
    this.socket.off('connect', this.onConnect.bind(this));
    this.socket.off('data', this.onData.bind(this));
    this.socket.off('error', this.onError.bind(this));
    this.socket.off('end', this.onEnd.bind(this));

    // Set state back to null
    this.state = SermoSocketState.DISCONNECTED;
    this.lastMessage = undefined;
    this.buffer = [];

    // Destroy connection with socket
    this.socket.destroy();
  }

  /**
   * Reconnect with socket.
   */
  reconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    // Disconnect
    this.disconnect();

    // Retry connection
    let timeout = 100;
    if (this.reconnectCount > 200) timeout = 10000;
    else if (this.reconnectCount > 150) timeout = 5000;
    else if (this.reconnectCount > 100) timeout = 2000;
    else if (this.reconnectCount > 50) timeout = 1000;
    else if (this.reconnectCount > 20) timeout = 500;

    this.reconnectTimeout = setTimeout(() => {
      // Clear timeout
      clearTimeout(this.reconnectTimeout as NodeJS.Timeout);
      this.reconnectTimeout = undefined;
      this.reconnectCount++;

      // Try to connect again, this will trigger a reconnect if failed to connect
      this.connect();
    }, timeout);
  }

  /**
   * Perform a Sermo Socket request.
   *
   * @param method SermoRequestMethod
   * @param url URL
   * @param options SermoRequestOptions
   * @returns SermoResponse
   */
  async request<T = any, R = SermoResponse<T>>(
    method: SermoRequestMethod,
    url: string,
    options?: SermoRequestOptions,
  ): Promise<R> {
    const request: SermoRequest = {
      method: method.toUpperCase() as SermoRequestMethod,
      url: url,
      headers: options?.headers,
      query: options?.query,
      body: options?.body,
      requestId: String(Math.random()),
    };

    // Cancel request if socket is offline
    if (!this.socket || this.connected() === false) {
      throw new SermoSocketError('SocketOffline');
    }

    // Create request
    return new Promise((resolve, reject) => {
      const buffer = Buffer.concat([
        Buffer.from(JSON.stringify(request)),
        Buffer.from([this.options.endByte]),
      ]);
      this.socket?.write(buffer);

      // Create pending request
      const timeout = setTimeout(
        () => reject(new SermoSocketTimeout(request.requestId)),
        options?.timeout || 5000,
      );

      this.pendingRequest.set(request.requestId, {
        resolve: resolve as (
          value: SermoResponse<any> | PromiseLike<SermoResponse<any>>,
        ) => void,
        reject,

        timeout,
        requestId: request.requestId,
      });
    });
  }

  /**
   * Perform a GET request.
   *
   * @param url URL
   * @param options SermoRequestOptions
   * @returns SermoResponse
   */
  async get<T = any, R = SermoResponse<T>>(
    url: string,
    options?: SermoRequestOptions,
  ): Promise<R> {
    return this.request<T, R>('GET', url, options);
  }

  /**
   * Perform a POST request.
   *
   * @param url URL
   * @param data Data
   * @param options SermoRequestOptions
   * @returns SermoResponse
   */
  async post<T = any, R = SermoResponse<T>>(
    url: string,
    data?: any,
    options?: SermoRequestOptions,
  ): Promise<R> {
    return this.request<T, R>(
      'POST',
      url,
      Object.assign({ body: data }, options),
    );
  }

  /**
   * Perform a PUT request.
   *
   * @param url URL
   * @param data Data
   * @param options SermoRequestOptions
   * @returns SermoResponse
   */
  async put<T = any, R = SermoResponse<T>>(
    url: string,
    data?: any,
    options?: SermoRequestOptions,
  ): Promise<R> {
    return this.request<T, R>(
      'PUT',
      url,
      Object.assign({ body: data }, options),
    );
  }

  /**
   * Perform a PATCH request.
   *
   * @param url URL
   * @param data Data
   * @param options SermoRequestOptions
   * @returns SermoResponse
   */
  async patch<T = any, R = SermoResponse<T>>(
    url: string,
    data?: any,
    options?: SermoRequestOptions,
  ): Promise<R> {
    return this.request<T, R>(
      'PATCH',
      url,
      Object.assign({ body: data }, options),
    );
  }

  /**
   * Perform a DELETE request.
   *
   * @param url URL
   * @param options  SermoRequestOptions
   * @returns SermoResponse
   */
  async delete<T = any, R = SermoResponse<T>>(
    url: string,
    options?: SermoRequestOptions,
  ): Promise<R> {
    return this.request<T, R>('DELETE', url, options);
  }

  /**
   * Add a listener for a given event.
   *
   * @param event SermoEvent
   * @param fn Callback
   */
  on<T extends EventEmitter.EventNames<SermoEvents>>(
    event: T,
    fn: EventEmitter.EventListener<SermoEvents, T>,
  ) {
    return this.emitter.on(event, fn);
  }

  /**
   * Add a one-time listener for a given event.
   *
   * @param event SermoEvent
   * @param fn Callback
   */
  once<T extends EventEmitter.EventNames<SermoEvents>>(
    event: T,
    fn: EventEmitter.EventListener<SermoEvents, T>,
  ) {
    return this.emitter.once(event, fn);
  }

  /**
   * Verify whether the socket is connected.
   *
   * @returns boolean
   */
  connected(): boolean {
    return this.state === SermoSocketState.CONNECTED;
  }

  /**
   * Verify whether the socket is disconnected.
   *
   * @returns boolean
   */
  disconnected(): boolean {
    return this.state === SermoSocketState.DISCONNECTED;
  }

  // Private functions
  private onMessage(): void {
    this.lastMessage = new Date();
  }

  /**
   * Triggered when the state of the Socket changes.
   *
   * @param state SermoSocketState
   */
  private onStateChange(state: SermoSocketState): void {
    if (this.state === state) {
      return;
    }

    // On connect
    if (state === SermoSocketState.CONNECTED) {
      // Nothing to do here (yet)
    }

    if (state === SermoSocketState.DISCONNECTED) {
      // Only trigger when state was connected first
      if (this.state === SermoSocketState.CONNECTED) {
        this.emitter.emit('disconnect');
      }

      // Trigger reconnect if state changed to false (if not disabled)
      if (this.options.reconnect !== false) this.reconnect();

      // Throw error on all pending requests
      this.pendingRequest.forEach((request, requestId) => {
        request.reject(new SermoSocketTimeout(requestId));
      });
    }

    // State has changed
    this.emitter.emit('state-change', state, this.state);
    this.state = state;

    // Emit connect after setting state, because else the offline error will cause problems
    if (state === SermoSocketState.CONNECTED) {
      this.emitter.emit('connect');
    }
  }

  /**
   * Triggered when the Socket connected.
   */
  private onConnect(): void {
    this.reconnectCount = 0;
    this.onStateChange(SermoSocketState.CONNECTED);
    this.onMessage();
  }

  /**
   * Triggered when data is received.
   *
   * @param data Buffer
   */
  private onData(data: Buffer): void {
    // Split data by end byte
    const messages = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== this.options.endByte) {
        this.buffer.push(data[i]);
      } else {
        messages.push(Buffer.from(this.buffer));
        this.buffer = [];
      }
    }

    messages.forEach((messageBuffer: Buffer) => {
      let message = {} as SermoResponse;
      try {
        message = JSON.parse(messageBuffer.toString()) as SermoResponse;
      } catch (e) {
        return;
      }

      // Update last message
      this.onMessage();

      // Push request
      if (message.type.toUpperCase() === 'PUSH') {
        this.emitter.emit('push', message);
      }

      // Response on request
      if (
        message.type.toUpperCase() === 'REQUEST' &&
        this.pendingRequest.has(message.requestId)
      ) {
        const request = this.pendingRequest.get(message.requestId);

        clearTimeout(request.timeout);
        if (message.code >= 200 && message.code < 300) {
          request.resolve(message);
        } else {
          request.reject(
            new SermoSocketRequestError(
              message.data?.error || 'Request failed',
              message.code,
              message.url,
              message.data,
            ),
          );
        }

        this.pendingRequest.delete(message.requestId);
      }
    });
  }

  /**
   * Triggered when an error is received.
   *
   * @param err Error
   */
  private onError(err: Error): void {
    this.onStateChange(SermoSocketState.DISCONNECTED);
    this.emitter.emit('error', err);
  }

  /**
   * Triggered when the stream ends.
   */
  private onEnd(): void {
    this.onStateChange(SermoSocketState.DISCONNECTED);
  }
}

export default SermoSocket;
