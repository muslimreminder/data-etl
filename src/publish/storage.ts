import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    NoSuchKey,
    NotFound,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';

export type PutOptions = { cacheControl: string };
export type PutBytesOptions = PutOptions & { contentType: string };

/** Where published files live. Paths are object keys, e.g. `v1/manifest.json`. */
export interface ContentStorage {
    readonly description: string;
    get(path: string): Promise<string | undefined>;
    exists(path: string): Promise<boolean>;
    put(path: string, body: string, options: PutOptions): Promise<void>;
    /** Publishes a binary file, e.g. the audio of a verse. */
    putBytes(path: string, body: Uint8Array, options: PutBytesOptions): Promise<void>;
    /**
     * Paths already published under `prefix`. The audio mirror reads it once per recitation rather
     * than asking for 6,236 files one by one.
     */
    list(prefix: string): Promise<Set<string>>;
}

/** Local folder, to inspect the output without touching R2. */
export class LocalStorage implements ContentStorage {
    readonly description: string;
    private readonly root: string;

    constructor(root: string) {
        this.root = root;
        this.description = `local folder ${root}`;
    }

    async get(path: string) {
        return readFile(join(this.root, path), 'utf8').catch(() => undefined);
    }

    async exists(path: string) {
        return stat(join(this.root, path)).then(() => true, () => false);
    }

    async put(path: string, body: string) {
        const file = join(this.root, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, body);
    }

    async putBytes(path: string, body: Uint8Array) {
        const file = join(this.root, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, body);
    }

    async list(prefix: string) {
        const folder = join(this.root, prefix);
        const names = await readdir(folder).catch(() => []);
        return new Set(names.map((name) => `${prefix}${name}`));
    }
}

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

/** Cloudflare R2 through its S3-compatible API. */
export class R2Storage implements ContentStorage {
    readonly description: string;
    private readonly client: S3Client;
    private readonly bucket: string;

    constructor(config: R2Config) {
        this.bucket = config.bucket;
        this.description = `R2 bucket ${config.bucket}`;
        this.client = new S3Client({
            region: 'auto',
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        });
    }

    async get(path: string) {
        try {
            const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: path }));
            return await object.Body?.transformToString('utf-8');
        } catch (error) {
            if (error instanceof NoSuchKey) return undefined;
            throw error;
        }
    }

    async getBytes(path: string): Promise<Uint8Array | undefined> {
        try {
            const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: path }));
            return await object.Body?.transformToByteArray();
        } catch (error) {
            if (error instanceof NoSuchKey) return undefined;
            throw error;
        }
    }

    /** Text of an object and when it was uploaded. */
    async getWithDate(path: string): Promise<{ text: string; modifiedAt: Date } | undefined> {
        try {
            const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: path }));
            const text = await object.Body?.transformToString('utf-8');
            return text === undefined ? undefined : { text, modifiedAt: object.LastModified ?? new Date() };
        } catch (error) {
            if (error instanceof NoSuchKey) return undefined;
            throw error;
        }
    }

    async exists(path: string) {
        try {
            await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: path }));
            return true;
        } catch (error) {
            if (error instanceof NotFound) return false;
            throw error;
        }
    }

    async put(path: string, body: string, options: PutOptions) {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: path,
                Body: body,
                ContentType: 'application/json; charset=utf-8',
                CacheControl: options.cacheControl,
            }),
        );
    }

    async putBytes(path: string, body: Uint8Array, options: PutBytesOptions) {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: path,
                Body: body,
                ContentType: options.contentType,
                CacheControl: options.cacheControl,
            }),
        );
    }

    async list(prefix: string) {
        const keys = new Set<string>();
        let token: string | undefined;
        do {
            const page = await this.client.send(
                new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
            );
            for (const object of page.Contents ?? []) {
                if (object.Key) keys.add(object.Key);
            }
            token = page.NextContinuationToken;
        } while (token);
        return keys;
    }
}
