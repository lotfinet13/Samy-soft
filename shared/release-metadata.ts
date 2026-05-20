/** Logical backup archive format (ZIP layout). */
export const BACKUP_ARCHIVE_FORMAT = "ZIP_V1" as const;

/** Manifest schema version inside manifest.json (v2 = full factory metadata). */
export const BACKUP_MANIFEST_SCHEMA_VERSION = 2 as const;

export const RELEASE_CHANNEL_DEFAULT = "production" as const;
