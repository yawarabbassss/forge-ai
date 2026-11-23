import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { createRequire } from 'module';
import { PluginManifest } from '../core/plugin.js';
import { logger } from '../utils/logger.js';
import { validateManifest } from './validation.js';

const require = createRequire(import.meta.url);

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
            // Use require() for synchronous JSON loading (ESM requires url:// on Windows)
            const content = JSON.parse(readFileSync(actualPath, 'utf-8'));
            const validationResult = validateManifest(content);

            if (validationResult.valid) {
              const handlerPath = findHandler(fullPath);
              results.push({
                id: content.id,
                name: content.name,
                version: content.version,
                path: fullPath,
                manifest: content as PluginManifest,
                handlerPath,
              });
              logger.info(
                { plugin: content.id, path: fullPath },
                'Discovered plugin',
              );
            } else {
              logger.warn(
                { path: actualPath, errors: validationResult.errors },
                'Invalid plugin manifest',
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

/** Find handler .js file in plugin directory using dynamic import with file:// URL */
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
