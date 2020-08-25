import SermoSocket, { SermoSocketOptions, Request, RequestMethod, RequestOptions, Response, ResponseType } from './socket';

export class Sermo {
  static async connect (options: SermoSocketOptions): Promise<SermoSocket> {
    return new SermoSocket(options).connect();
  }
}

export {
  SermoSocket,
  SermoSocketOptions,

  Request,
  RequestMethod,
  RequestOptions,

  Response,
  ResponseType
}

export default Sermo;
