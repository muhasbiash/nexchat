const CLOUDINARY_AVATAR_FOLDER = 'nexchat/avatars';

export interface CloudinaryConfig {
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
}

async function sha1Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-1', data);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createAvatarUploadSignature(
  userId: string,
  config: CloudinaryConfig,
): Promise<{
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
}> {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = CLOUDINARY_AVATAR_FOLDER;
  const publicId = userId;

  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = await sha1Hex(`${paramsToSign}${config.CLOUDINARY_API_SECRET}`);

  return {
    cloudName: config.CLOUDINARY_CLOUD_NAME,
    apiKey: config.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
    publicId,
  };
}
