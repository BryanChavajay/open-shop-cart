/** Binary storage for catalog product images. */
export interface ImageStorage {
  /** Persists the content under the given storage key. */
  save(key: string, content: Buffer): Promise<void>;
  /** Reads the stored content; null when the key does not exist. */
  read(key: string): Promise<Buffer | null>;
  /** Deletes the stored content. */
  delete(key: string): Promise<void>;
}

// Implementation contract notes (not part of the interface):
// - Never exposes physical paths; each implementation encapsulates its backing
//   filesystem or object storage.
