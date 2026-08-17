import fp from 'fastify-plugin';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import type { FastifyInstance } from 'fastify';

export interface CloudinaryService {
  uploadImage(
    fileBuffer: Buffer,
    options?: { folder?: string; publicId?: string }
  ): Promise<UploadApiResponse>;
}

declare module 'fastify' {
  interface FastifyInstance {
    cloudinary: CloudinaryService;
  }
}

async function cloudinaryPluginFn(fastify: FastifyInstance) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const defaultFolder = process.env.CLOUDINARY_FOLDER || 'tedxpune/avatars';

  if (!cloudName || !apiKey || !apiSecret) {
    fastify.log.warn('Cloudinary environment variables missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET). Uploads will fail unless configured.');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  const uploadService: CloudinaryService = {
    async uploadImage(fileBuffer: Buffer, options = {}) {
      return new Promise<UploadApiResponse>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: options.folder || defaultFolder,
            public_id: options.publicId,
            resource_type: 'image',
            overwrite: true,
          },
          (error, result) => {
            if (error || !result) {
              return reject(error || new Error('Cloudinary upload failed'));
            }
            resolve(result);
          }
        );
        uploadStream.end(fileBuffer);
      });
    },
  };

  fastify.decorate('cloudinary', uploadService);
}

export const cloudinaryPlugin = fp(cloudinaryPluginFn, { name: 'cloudinary' });
