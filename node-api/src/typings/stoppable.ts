declare module 'stoppable' {
  import { Server } from 'http';

  class StoppableServer extends Server {
    public stop(callback: (err: Error) => void): void;
  }

  function stoppable(server: Server, grace?: number): StoppableServer;

  export = stoppable;
}
