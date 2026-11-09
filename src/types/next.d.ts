// Type definitions fallback for Next.js app router
declare module "next" {
  export interface Metadata {
    title?: string;
    description?: string;
    [key: string]: any;
  }
  export interface NextConfig {
    [key: string]: any;
  }
  export default function next(options?: any): any;
}

declare module "next/server" {
  export class NextRequest extends Request {
    nextUrl: URL;
    cookies: any;
  }
  export class NextResponse extends Response {
    static json(body: any, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
    cookies: any;
  }
}

declare module "next/headers" {
  export function cookies(): Promise<any>;
  export function headers(): Promise<any>;
}
