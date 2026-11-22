import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { PluginManifest } from '../core/plugin.js';
import { logger } from '../utils/logger.js';

/** Represents a discovered plugin manifest location */
export interface PluginDiscovery {
  id: string;
  name: string;
  version: string;
  path: string;
  manifest: PluginManifest;
  handlerPath?: string;
}

/**
 * Scan directories for plugin manifests (.json files)
 */
export async function discoverPlugins(
  searchPaths: string[],
): Promise<PluginDiscovery[]> {
  const results: PluginDiscovery[] = [];
  const visitedDirs = new Set<string>();

  for (const basePath of searchPaths) {
    const resolvedPath = resolve(basePath);
    if (!existsSync(resolvedPath)) {
      logger.warn({ path: resolvedPath }, 'Plugin directory not found');
      continue;
    }

    await scanDirectory(resolvedPath, results, visitedDirs);
  }

  return results;
}

async function scanDirectory(
  dirPath: string,
  results: PluginDiscovery[],
  visitedDirs: Set<string>,
): Promise<void> {
  if (visitedDirs.has(dirPath)) return;
  visitedDirs.add(dirPath);

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Look for plugin.json or manifest.json
        const manifestPath = join(fullPath, 'plugin.json');
        const altManifestPath = join(fullPath, 'manifest.json');

        if (existsSync(manifestPath) || existsSync(altManifestPath)) {
          const actualPath = existsSync(manifestPath) ? manifestPath : altManifestPath;
          try {
            const content = await import(actualPath);
            const manifest = typeof content === 'string' ? JSON.parse(content) : content.default || content;

            if (isValidManifest(manifest)) {
              const handlerPath = findHandler(fullPath);
              results.push({
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                path: fullPath,
                manifest,
                handlerPath,
              });
              logger.info(
                { plugin: manifest.id, path: fullPath },
                'Discovered plugin',
              );
            }
          } catch (err) {
            logger.warn(
              { path: actualPath, error: err instanceof Error ? err.message : String(err) },
              'Failed to parse plugin manifest',
            );
          }
        } else {
          // Recurse into subdirectory
          await scanDirectory(fullPath, results, visitedDirs);
        }
      }
    }
  } catch (err) {
    logger.warn(
      { path: dirPath, error: err instanceof Error ? err.message : String(err) },
      'Failed to scan plugin directory',
    );
  }
}

/** Find handler .js file in plugin directory */
function findHandler(dirPath: string): string | undefined {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      !entry.name.startsWith('_') &&
      entry.name !== 'plugin.json' &&
      entry.name !== 'manifest.json'
    ) {
      return join(dirPath, entry.name);
    }
  }

  return undefined;
}

function isValidManifest(manifest: any): boolean {
  return (
    manifest &&
    typeof manifest.id === 'string' &&
    typeof manifest.name === 'string' &&
    typeof manifest.version === 'string' &&
    Array.isArray(manifest.tools) &&
    manifest.tools.length > 0
  );
}
