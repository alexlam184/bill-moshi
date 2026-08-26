const accountQueues = new Map<string, Promise<void>>();

/**
 * Google Drive has no atomic "create folder if missing" operation. Serialize
 * workspace setup for one account so overlapping sync and receipt requests do
 * not both create the same folder hierarchy.
 */
export async function withGoogleWorkspaceAccountLock<T>(
  accountKey: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = accountQueues.get(accountKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current, () => current);
  accountQueues.set(accountKey, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (accountQueues.get(accountKey) === tail) accountQueues.delete(accountKey);
  }
}
