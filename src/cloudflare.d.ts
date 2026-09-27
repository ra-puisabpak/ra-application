interface D1PreparedStatement {
  bind(...values: unknown[]): this;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement & { all<T>(): Promise<{ results: T[] }> };
  batch(statements: D1PreparedStatement[]): Promise<unknown>;
}

interface R2Bucket {
  put(key: string, value: ReadableStream | null, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; }
interface ExportedHandler<E> { fetch(request: Request, env: E, ctx: ExecutionContext): Response | Promise<Response>; }
