import { SermoRequest } from './sermo-socket.interface';

/**
 * Sermo Socket error
 */
export class SermoSocketError extends Error {}

/**
 * Sermo Socket Request Error
 */
export class SermoSocketRequestError extends SermoSocketError {
  public code: number;
  public url: string | undefined = undefined;
  public data: any | undefined = undefined;

  constructor(message: string, code: number, url?: string, data?: any) {
    super(message);

    this.name = SermoSocketRequestError.name;
    this.code = code;
    this.url = url;
    this.data = data;
  }
}

/**
 * Sermo Socket Timeout
 */
export class SermoSocketTimeout extends SermoSocketError {
  /**
   * Request ID that timed out.
   */
  public requestId: string | undefined = undefined;

  /**
   * Sermo Request config.
   */
  public config: SermoRequest;

  constructor(request: SermoRequest) {
    super('Request timed out');

    this.name = SermoSocketTimeout.name;
    this.config = request;
    this.requestId = request.requestId;
  }
}
