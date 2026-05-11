export type Principal = {
  id: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
};

export interface AuthProvider {
  authenticate(request: { headers?: Record<string, string>; token?: string }): Promise<Principal | null>;
}

export interface ApiKeyStore {
  findByToken(token: string): Promise<Principal | null>;
}

export type OAuthVerifier =
  | {
      verify(token: string, request?: { headers?: Record<string, string>; token?: string }): Promise<Principal | null>;
    }
  | ((token: string, request?: { headers?: Record<string, string>; token?: string }) => Promise<Principal | null>);

export class ApiKeyAuthProvider implements AuthProvider {
  constructor(private readonly keys: ApiKeyStore) {}

  async authenticate(request: { headers?: Record<string, string>; token?: string }): Promise<Principal | null> {
    const token = request.token ?? request.headers?.authorization?.replace(/^Bearer\s+/i, "");
    return token ? this.keys.findByToken(token) : null;
  }
}

export class OAuthProvider implements AuthProvider {
  constructor(private readonly verifier: OAuthVerifier) {}

  async authenticate(request: { headers?: Record<string, string>; token?: string }): Promise<Principal | null> {
    const token = request.token ?? request.headers?.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    if (typeof this.verifier === "function") return this.verifier(token, request);
    return this.verifier.verify(token, request);
  }
}
