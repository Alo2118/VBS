export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type ApiError = {
  code?: string;
  message: string;
  details?: unknown;
};

export const apiClient = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as ApiError;
    throw new Error(errorBody.message || "Errore inatteso");
  }

  return (await response.json()) as T;
};
