import { createHash } from 'node:crypto';
import {
    CONTENT_PATH_PREFIX,
    CONTENT_SCHEMA_VERSION,
    hashedPath,
    MANIFEST_PATH,
    ManifestSchema,
    type Manifest,
    type ManifestFile,
} from '@muslimreminder/schema/content';
import type { z } from 'zod';
import type { OutputFile } from '../output.ts';
import type { ContentStorage } from './storage.ts';

/** Hashed files never change: cached for a year by the CDN and the apps. */
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/** The manifest is the entry point: short cache so that new content shows up quickly. */
export const MANIFEST_CACHE = 'public, max-age=300';

const objectKey = (path: string) => `${CONTENT_PATH_PREFIX}/${path}`;

export async function readManifest(storage: ContentStorage): Promise<Manifest | undefined> {
    const body = await storage.get(objectKey(MANIFEST_PATH));
    return body === undefined ? undefined : ManifestSchema.parse(JSON.parse(body));
}

/** Reads the currently published content of a key, if any. */
export async function readPublished<T extends z.ZodType>(
    storage: ContentStorage,
    manifest: Manifest | undefined,
    key: string,
    schema: T,
): Promise<z.infer<T> | undefined> {
    const entry = manifest?.files[key];
    if (!entry) return undefined;
    const body = await storage.get(objectKey(entry.path));
    return body === undefined ? undefined : schema.parse(JSON.parse(body));
}

export type PublishResult = { uploaded: string[]; unchanged: number; manifestUpdated: boolean };

/**
 * Uploads new or changed files first, then the manifest last, so that a client never
 * sees a manifest pointing to a file that is not there yet. Keys not in `files` are kept.
 */
export async function publish(
    storage: ContentStorage,
    files: OutputFile[],
    options: { previous: Manifest | undefined; now: Date; dryRun: boolean; log: (message: string) => void },
): Promise<PublishResult> {
    const { previous, dryRun, log } = options;
    const entries: Record<string, ManifestFile> = { ...previous?.files };
    const uploaded: string[] = [];
    let unchanged = 0;

    for (const file of files) {
        const body = JSON.stringify(file.data);
        const sha256 = createHash('sha256').update(body).digest('hex');
        const entry: ManifestFile = { path: hashedPath(file.key, sha256), sha256, bytes: Buffer.byteLength(body) };
        entries[file.key] = entry;

        if (previous?.files[file.key]?.sha256 === sha256 || (await storage.exists(objectKey(entry.path)))) {
            unchanged++;
            continue;
        }
        uploaded.push(entry.path);
        if (!dryRun) {
            await storage.put(objectKey(entry.path), body, { cacheControl: IMMUTABLE_CACHE });
        }
    }

    const sameFiles = previous !== undefined && JSON.stringify(sortKeys(previous.files)) === JSON.stringify(sortKeys(entries));
    if (sameFiles) {
        log('No content change: manifest kept as is');
        return { uploaded, unchanged, manifestUpdated: false };
    }

    const manifest = ManifestSchema.parse({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        generatedAt: options.now.toISOString(),
        files: sortKeys(entries),
    });
    if (!dryRun) {
        await storage.put(objectKey(MANIFEST_PATH), JSON.stringify(manifest), { cacheControl: MANIFEST_CACHE });
    }
    return { uploaded, unchanged, manifestUpdated: true };
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
    return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
