import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

export type ServerConfig = {
  readonly host: string;
  readonly port: number;
};

export function resolveServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerConfig {
  const rawPort = env.PORT ?? '4173';
  const parsedPort = Number(rawPort);
  const port =
    Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 4173;
  return { host: env.HOST ?? '127.0.0.1', port };
}

const server = resolveServerConfig(process.env);

export default defineConfig({
  base: './',
  plugins: [react()],
  // The polyfill embeds a fetch() call; every supported browser already has modulepreload.
  build: { modulePreload: { polyfill: false } },
  server,
  preview: { ...server, allowedHosts: true },
} satisfies UserConfig);
