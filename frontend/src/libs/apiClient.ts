export class AuthError extends Error {
  constructor(message = "Sesión expirada") {
    super(message);
    this.name = "AuthError";
  }
}

export interface HttpClientConfig {
  /** Prefijo opcional para todas las URLs, ej. "https://api.miapp.com" */
  baseUrl?: string;
  /** Endpoint de refresh (se llama con POST y credentials: "include") */
  refreshUrl: string;
  /** Cómo leer el access token actual (memoria, store, etc.) */
  getAccessToken: () => string | null;
  /** Cómo guardar el nuevo access token */
  setAccessToken: (token: string | null) => void;
  /** Extrae el token de la respuesta del refresh. Por defecto: { accessToken } */
  parseRefreshResponse?: (res: Response) => Promise<string>;
  /** Se ejecuta cuando el refresh falla (ej. redirigir a /login) */
  onAuthFailure?: () => void;
}

export interface RequestOptions extends RequestInit {
  /** No añade Authorization ni intenta refresh (login, registro, etc.) */
  skipAuth?: boolean;
}

export class HttpClient {
  private refreshPromise: Promise<boolean> | null = null;
  config: HttpClientConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;
  }

  /** Punto de entrada para todas las peticiones de la app */
  async request(url: string, options: RequestOptions = {}): Promise<Response> {
    const tokenUsed = this.config.getAccessToken();
    const res = await this.send(url, options, tokenUsed);

    if (res.status !== 401 || options.skipAuth) return res;

    // Si otra petición ya renovó el token mientras esta estaba en vuelo,
    // basta con reintentar; si no, hay que hacer (o esperar) el refresh.
    const currentToken = this.config.getAccessToken();
    if (currentToken === tokenUsed) {
      const refreshed = await this.refreshToken();
      if (!refreshed) throw new AuthError();
    }

    return this.send(url, options, this.config.getAccessToken());
  }

  /** Atajo que parsea JSON y lanza error si !res.ok */
  async json<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const res = await this.request(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  // ---------------------------------------------------------------------------

  private send(
    url: string,
    options: RequestOptions,
    token: string | null,
  ): Promise<Response> {
    const { skipAuth, headers, ...init } = options;
    const finalHeaders = new Headers(headers);

    if (!skipAuth && token) {
      finalHeaders.set("Authorization", `Bearer ${token}`);
    }

    return fetch((this.config.baseUrl ?? "") + url, {
      ...init,
      headers: finalHeaders,
      credentials: init.credentials ?? "include",
    });
  }

  /** Un único refresh en curso: las demás peticiones reutilizan la misma promesa */
  private refreshToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(
          (this.config.baseUrl ?? "") + this.config.refreshUrl,
          {
            method: "POST",
            credentials: "include", // envía la cookie con el refresh token
          },
        );
        if (!res.ok) return this.fail();

        const parse =
          this.config.parseRefreshResponse ??
          (async (r: Response) => (await r.json()).accessToken as string);

        const token = await parse(res);
        if (!token) return this.fail();

        this.config.setAccessToken(token);
        return true;
      } catch {
        return this.fail();
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private fail(): false {
    this.config.setAccessToken(null);
    this.config.onAuthFailure?.(); // se llama una sola vez por refresh fallido
    return false;
  }
}

// todo: agregar el estado global de zustand
let accessToken: string | null = null;

// todo: quitar los datos de prueba
export const apiClient = new HttpClient({
  baseUrl: import.meta.env.VITE_API_URL,
  refreshUrl: "/auth/refresh",
  getAccessToken: () => accessToken,
  setAccessToken: (t) => {
    accessToken = t;
  },
  onAuthFailure: () => {
    window.location.href = "/login";
  },
});

// Ejemplo de uso
//
// let accessToken: string | null = null;
//
// export const http = new HttpClient({
//   baseUrl: import.meta.env.VITE_API_URL,
//   refreshUrl: "/auth/refresh",
//   getAccessToken: () => accessToken,
//   setAccessToken: (t) => { accessToken = t; },
//   onAuthFailure: () => { window.location.href = "/login"; },
// });
//
// const users = await http.json<User[]>("/users");
//
// await http.request("/posts", {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ title: "Hola" }),
// });
//
// await http.request("/auth/login", { method: "POST", body: "...", skipAuth: true });
