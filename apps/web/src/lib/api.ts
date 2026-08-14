const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface HealthResponse {
  status: 'ok';
  service: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<HealthResponse>;
}
