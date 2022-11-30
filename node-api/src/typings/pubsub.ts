export interface IPubSubEvent<T = any> {
  ack: () => void;
  attributes: any;
  data: T;
  id: string;
  length: number;
  nack: () => void;
  publishTime: string;
  received: number;
}
