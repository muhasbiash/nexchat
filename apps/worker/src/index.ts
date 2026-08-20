export interface Env {
  ENVIRONMENT: string;
}

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    return Response.json({
      name: 'NexChat Worker',
      status: 'ok',
      environment: env.ENVIRONMENT,
    });
  },
};
