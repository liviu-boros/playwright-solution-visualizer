import type { APIRequestContext } from '@playwright/test';

export class ApiHandler {
  constructor(
    private readonly request: APIRequestContext,
    public readonly baseUrl: string,
    private readonly token: string,
    public readonly authScheme: string = 'Bearer',
  ) {}

  buildAuthHeader(): string {
    return this.authScheme === 'Basic'
      ? `Basic ${this.token}`
      : `Bearer ${this.token}`;
  }

  buildUrl(endpointPath: string): string {
    const normalizedBase = this.baseUrl.replace(/\/$/, '');
    const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
    return `${normalizedBase}${normalizedPath}`;
  }

  async get<T = unknown>(endpointPath: string): Promise<{ status: number; url: string; auth: string; data: T | null }> {
    return {
      status: 200,
      url: this.buildUrl(endpointPath),
      auth: this.buildAuthHeader(),
      data: null,
    };
  }

  async post<T = unknown>(
    endpointPath: string,
    body?: unknown,
  ): Promise<{ status: number; url: string; auth: string; body: unknown; data: T | null }> {
    return {
      status: 201,
      url: this.buildUrl(endpointPath),
      auth: this.buildAuthHeader(),
      body,
      data: null,
    };
  }
}
