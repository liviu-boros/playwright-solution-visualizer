export class AuthEndpoints {
  constructor(page?: any) {}
  async refreshToken(): Promise<string> {
    return "new-token";
  }
}

export const EndpointsApi = AuthEndpoints;
export type EndpointsApi = AuthEndpoints;
