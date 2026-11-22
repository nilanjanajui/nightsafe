export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

type Opts = { method?: string; body?: unknown; token?: string | null };

export async function api<T>(path: string, { method = "GET", body, token }: Opts = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
        res = await fetch(`${API_URL}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
        throw new ApiError(0, "Can't reach the server. Check your connection");
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? "Request failed");
    return data as T;
}