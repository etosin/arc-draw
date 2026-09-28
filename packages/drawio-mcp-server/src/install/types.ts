export interface McpEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
  transport: "stdio";
}

export type DetectResult = "installed" | "config-present" | "absent";

export interface HostAdapter {
  id: string;
  displayName: string;
  defaultPaths(): string[];
  detect(): Promise<DetectResult>;
  read(path: string): Promise<string>;
  merge(
    source: string,
    entry: McpEntry,
    name: string,
    opts: { uninstall: boolean },
  ): string;
  diffLabel(): string;
}

export interface InstallOptions {
  host: string;
  name: string;
  editor: boolean;
  httpPort: number;
  extraArgs: string[];
  env: Record<string, string>;
  configPath?: string;
  configPathByHost: Record<string, string>;
  print: boolean;
  dryRun: boolean;
  uninstall: boolean;
  yes: boolean;
}
