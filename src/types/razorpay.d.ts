declare module "razorpay" {
  export default class Razorpay {
    constructor(options: { key_id: string; key_secret: string });
    paymentLink: {
      create(options: any): Promise<any>;
      fetch(paymentLinkId: string): Promise<any>;
      cancel(paymentLinkId: string): Promise<any>;
    };
    subscriptions: {
      create(options: any): Promise<any>;
      fetch(subscriptionId: string): Promise<any>;
      cancel(subscriptionId: string, cancelAtCycleEnd?: boolean): Promise<any>;
    };
    payments: {
      fetch(paymentId: string): Promise<any>;
      capture(paymentId: string, amount: number, currency: string): Promise<any>;
    };
  }
}

