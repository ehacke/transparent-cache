export interface CacheInterface<T, U> {
  client: T;
  get: (key: string) => Promise<U | null>;
  setpx: (key: string, value: U, ttlMs?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
}
