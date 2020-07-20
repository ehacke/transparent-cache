export interface CacheInterface<T, U> {
  client: T;
  get: (key: string) => Promise<U | undefined>;
  setpx: (key: string, value: U, ttlMs?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

export interface CacheConfigInterface {
  ttlMs: number;
  size: number;
}
