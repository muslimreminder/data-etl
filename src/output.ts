/** A file to publish: its manifest key and its already validated content. */
export type OutputFile = {
    key: string;
    data: unknown;
};

/**
 * A binary file published at a content-hashed path that a published file refers to (a page font): uploaded
 * before the files, kept forever, and not listed in the manifest.
 */
export type OutputAsset = {
    path: string;
    bytes: Uint8Array;
    contentType: string;
};
