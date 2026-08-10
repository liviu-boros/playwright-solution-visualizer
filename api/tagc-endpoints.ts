export class AuthEndpoints {
  constructor(page) {}
  async refreshToken(): Promise<string> {
    return "new-token";
  }
}
