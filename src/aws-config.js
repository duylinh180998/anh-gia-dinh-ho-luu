import { S3Client } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';

const REGION = import.meta.env.VITE_AWS_REGION;
const COGNITO_POOL_ID = import.meta.env.VITE_COGNITO_POOL_ID;

if (!REGION || !COGNITO_POOL_ID) {
    console.error(
        '[aws-config] Missing environment variables! Please check your .env file.\n' +
        '  Required: VITE_AWS_REGION, VITE_COGNITO_POOL_ID, VITE_S3_BUCKET_NAME'
    );
}

/**
 * A singleton S3Client authenticated via Cognito Identity Pool (unauthenticated guest access).
 * No backend required — credentials are fetched directly from AWS Cognito.
 */
export const s3Client = new S3Client({
    region: REGION,
    credentials: fromCognitoIdentityPool({
        clientConfig: { region: REGION },
        identityPoolId: COGNITO_POOL_ID,
    }),
});

/** The S3 bucket name, read from environment variables. */
export const BUCKET_NAME = import.meta.env.VITE_S3_BUCKET_NAME;

/** The AWS region, read from environment variables. */
export const AWS_REGION = REGION;

/**
 * Converts an S3 object key into a public HTTPS URL.
 * Requires the S3 bucket to have public read access or a public bucket policy.
 *
 * @param {string} key - The S3 object key (e.g. "photos/my-image.jpg")
 * @returns {string} The full public S3 URL
 */
export function getPublicUrl(key) {
    return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
}
