//TODO: replace this with https://github.com/twilio/twilio-node/pull/330
declare module 'twilio' {
  class VoiceResponse {
    public play(opts: any, url: string): any;
    constructor();
  }
  class MessagingResponse {
    public message(msg: string): any;
    constructor();
  }
  interface TwimlInterface {
    VoiceResponse: typeof VoiceResponse;
    MessagingResponse: typeof MessagingResponse;
  }

  class Twilio {
    static twiml: TwimlInterface;
    constructor(sid: string, secret: string);

    messages: any;
    lookups: any;
  }
  export = Twilio;
}
