export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = 'ERROR',
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function getCsrf(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken;
  if (!csrfPromise || force) {
    csrfPromise = fetch('/api/auth/csrf', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { csrfToken: string }) => {
        csrfToken = d.csrfToken;
        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

async function toError(res: Response): Promise<ApiError> {
  let body: { error?: { message?: string; code?: string; details?: { fields?: Record<string, string> } } } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  const fallback =
    res.status === 413
      ? 'That file or request is too large.'
      : res.status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : 'The request could not be completed.';
  return new ApiError(res.status, body.error?.message ?? fallback, body.error?.code, body.error?.details?.fields ?? {});
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, url: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await getCsrf();
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline. Check your connection and try again.', 'NETWORK');
  }
  if (!res.ok) {
    const err = await toError(res);
    if (err.code === 'CSRF' && retry) {
      await getCsrf(true);
      return request<T>(method, url, body, false);
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  delete: <T>(url: string) => request<T>('DELETE', url),
};

/** Multipart upload with progress (fetch has no upload progress events). */
export async function uploadWithProgress<T>(url: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  const token = await getCsrf();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${url}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', token);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { error?: { message?: string; code?: string } } & Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else
        reject(
          new ApiError(
            xhr.status,
            body.error?.message ?? (xhr.status === 413 ? 'That file is too large.' : 'Upload failed. Please try again.'),
            body.error?.code,
          ),
        );
    };
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed — check your connection and try again.', 'NETWORK'));
    xhr.send(form);
  });
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
