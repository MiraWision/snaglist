import { resolve } from "node:path";
import { createDevServer } from "./server";

/**
 * `snaglist dev` — a local sidecar that receives feedback artifacts from the
 * LocalConnector and writes them into `.snaglist/`. Run it alongside your dev
 * server; a Claude Code skill then reads the folder and fixes the issues.
 */

interface Args {
  command: string;
  dir: string;
  port: number;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: "",
    dir: ".snaglist",
    port: 4477,
    help: false,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--port" || token === "-p") {
      args.port = Number.parseInt(rest[++i] ?? "", 10);
    } else if (token === "--dir" || token === "-d") {
      args.dir = rest[++i] ?? args.dir;
    } else if (!token.startsWith("-") && !args.command) {
      args.command = token;
    }
  }
  return args;
}

const USAGE = `snaglist dev — local feedback sidecar

Usage:
  npx snaglist dev [--port <n>] [--dir <path>]

Options:
  -p, --port <n>     Port to listen on (127.0.0.1 only). Default 4477.
  -d, --dir <path>   Folder to write artifacts into. Default .snaglist
  -h, --help         Show this help.

Pair with a LocalConnector in your app:
  createFeedbackWidget({ project, connectors: [new LocalConnector()] })
`;

function main(): void {
  const args = parseArgs(process.argv);

  if (args.help || args.command !== "dev") {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65_535) {
    process.stderr.write(`Invalid --port: ${args.port}\n`);
    process.exit(1);
  }

  const absDir = resolve(args.dir);
  const host = "127.0.0.1";
  const server = createDevServer({
    dir: args.dir,
    host,
    onFile: ({ sessionId, path, bytes }) => {
      process.stdout.write(`  ← ${sessionId}/${path}  (${bytes} bytes)\n`);
    },
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      process.stderr.write(
        `Port ${args.port} is already in use. Try --port <n>.\n`
      );
    } else {
      process.stderr.write(`Server error: ${error.message}\n`);
    }
    process.exit(1);
  });

  server.listen(args.port, host, () => {
    process.stdout.write(
      `snaglist dev listening on http://${host}:${args.port}\n` +
        `writing feedback to ${absDir}\n` +
        "waiting for reports (Ctrl+C to stop)…\n"
    );
  });

  const shutdown = (): void => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
