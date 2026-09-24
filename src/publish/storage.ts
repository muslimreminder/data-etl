import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GetObjectCommand, HeadObjectCommand, NoSuchKey, NotFound, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export type PutOptions = { cacheControl: string };

/** Where published files live. Paths are object keys, e.g. `v1/manifest.json`. */
export interface ContentStorage {
    readonly description: string;
    get(path: string): Promise<string | undefined>;
    exists(path: string): Promise<boolean>;
    put(path: string, body: string, options: PutOptions): Promise<void>;
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
}
