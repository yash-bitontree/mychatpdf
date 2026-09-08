export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
  fetcher?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type LimitKind = "ai_message" | "upload" | "storage" | "document_scope" | "chat_model" | "folder_chat" | "file_size";


export class LimitExceededError extends ApiError {
  constructor(
    public readonly kind: LimitKind,
    public readonly limit: number,
    public readonly used: number
  ) {
    super("Plan limit exceeded", 402);
    this.name = "LimitExceededError";
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken?: () => Promise<string | null>;
  private readonly fetcher: typeof fetch;

  constructor({ baseUrl = "", getToken, fetcher }: ApiClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.getToken = getToken;
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetch(path, init);

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async requestText(path: string, init: RequestInit = {}): Promise<string> {
    const response = await this.fetch(path, init);
    return response.text();
  }

  async requestStream(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetch(path, init);
  }

  async requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
    const response = await this.fetch(path, init);
    return response.blob();
  }

  url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken?.();
    const headers = new Headers(init.headers);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        code?: string;
        kind?: LimitKind;
        limit?: number;
        used?: number;
        detail?: unknown;
      } | null;
      if (response.status === 402 && body?.code === "limit_exceeded" && body.kind) {
        throw new LimitExceededError(body.kind, body.limit ?? 0, body.used ?? 0);
      }
      const detail = typeof body?.detail === "string" && body.detail.trim() ? body.detail : null;
      throw new ApiError(detail ?? (response.statusText || "Request failed"), response.status);
    }

    return response;
  }
}

export function createAuthenticatedApiClient(getToken: () => Promise<string | null>) {
  return new ApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
    getToken
  });
}
