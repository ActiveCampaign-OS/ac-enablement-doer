import { createHash } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const REGION = process.env.AWS_REGION || 'us-east-1'

function getBucket(): string {
  const bucket = process.env.S3_BUCKET
  if (!bucket) throw new Error('S3_BUCKET is not configured. Spark provisions it when @aws-sdk/client-s3 is installed.')
  return bucket
}

function client(): S3Client {
  return new S3Client({ region: REGION })
}

export async function putAssetObject(input: {
  requestId: string
  buildId: string
  fileName: string
  content: string | Uint8Array
  contentType: string
}): Promise<{ objectKey: string; sizeBytes: number; sha256: string }> {
  const bytes = typeof input.content === 'string' ? Buffer.from(input.content, 'utf8') : Buffer.from(input.content)
  const objectKey = `asset-builds/${input.requestId}/${input.buildId}/${input.fileName}`
  await client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: objectKey,
      Body: bytes,
      ContentType: input.contentType,
      ContentDisposition: `attachment; filename="${input.fileName.replace(/"/g, '')}"`,
    })
  )
  return {
    objectKey,
    sizeBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

export async function getAssetObject(objectKey: string): Promise<Uint8Array> {
  const result = await client().send(new GetObjectCommand({ Bucket: getBucket(), Key: objectKey }))
  const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
  if (!body?.transformToByteArray) throw new Error('S3 returned an empty asset body')
  return body.transformToByteArray()
}
