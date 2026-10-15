export const SPLIT_VERSION='sha256-id-first-byte-77-1.0.0';
export function splitFromDigest(bytes){if(!bytes||!Number.isInteger(bytes[0])||bytes[0]<0||bytes[0]>255)throw new Error('分割用のハッシュが不正です。');return bytes[0]<77?'holdout':'dev';}
// Hash the complete ID string, including the complete- prefix, exactly as sample_id is hashed.
export async function splitForId(id){if(typeof id!=='string'||!id)throw new Error('分割するIDがありません。');return splitFromDigest(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id))));}
