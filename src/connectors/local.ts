import type { ArtifactFile, FeedbackConnector } from "../types";

/**
 * Delivers artifacts to a local `snaglist dev` sidecar (see the CLI), which
 * writes them into the project's `.snaglist/` folder. Browser JS cannot write
 * to disk, so this posts to `http://127.0.0.1:{port}/put`.
 *
 * If the dev server is not running, it warns once per session and rethrows so
 * the core can report the failure — the UI is never blocked and other
 * connectors keep working.
 */
export interface LocalConnectorOptions {
  /** Dev server port. Default 4477. */
  port?: number;
  /** Dev server host. Default 127.0.0.1. */
  host?: string;
}

const DEFAULT_PORT = 4477;
const DEFAULT_HOST = "127.0.0.1";

export class LocalConnector implements FeedbackConnector {
  readonly id = "local";
  private readonly endpoint: string;
  private warned = false;

  constructor(options: LocalConnectorOptions = {}) {
    const port = options.port ?? DEFAULT_PORT;
    const host = options.host ?? DEFAULT_HOST;
    this.endpoint = `http://${host}:${port}/put`;
  }

  async put(sessionId: string, file: ArtifactFile): Promise<void> {
    const base64 = await blobToBase64(file.blob);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          path: file.path,
          mime: file.mime,
          base64,
        }),
      });
    } catch (error) {
      // Connection refused / server down: warn once, then rethrow.
      this.warnOnce();
      throw new Error(
        `[snaglist] local delivery failed (is \`npx snaglist dev\` running?): ${String(error)}`
      );
    }
    if (!response.ok) {
      throw new Error(
        `[snaglist] local delivery failed: ${response.status} for ${file.path}`
      );
    }
  }

  private warnOnce(): void {
    if (this.warned) {
      return;
    }
    this.warned = true;
    console.warn(
      `[snaglist] dev server not reachable at ${this.endpoint} — run \`npx snaglist dev\` to save feedback into .snaglist/. Feedback for this session will not be stored locally.`
    );
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
