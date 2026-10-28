type Handler = (message: string, resolve: (confirmed: boolean) => void) => void;
let handler: Handler | null = null;

export function registerDemoConfirmation(callback: Handler): () => void {
  handler = callback;
  return () => { if (handler === callback) handler = null; };
}

export function confirmDemo(message: string): Promise<boolean> {
  if (!handler) return Promise.resolve(false);
  return new Promise(resolve => handler?.(message, resolve));
}
