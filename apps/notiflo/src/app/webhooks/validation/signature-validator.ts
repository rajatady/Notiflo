import * as crypto from 'crypto';

/**
 * Validates webhook signatures for inbound provider callbacks.
 * Uses HMAC-SHA256 for generic webhooks and provider-specific validation
 * for SendGrid, Twilio, and others.
 */
export class SignatureValidator {
  /**
   * Generate an HMAC-SHA256 hex digest of the payload using the given secret.
   */
  static generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
  }

  /**
   * Validate a signature against a payload + secret using timing-safe comparison.
   */
  static validate(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    const expected = SignatureValidator.generateSignature(payload, secret);

    // Both buffers must have the same length for timingSafeEqual
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Validate a SendGrid Event Webhook signature.
   *
   * SendGrid signs webhooks using ECDSA with the public verification key.
   * The signed content is: timestamp + payload body.
   *
   * @see https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
   */
  static validateSendGrid(
    payload: string,
    signature: string,
    timestamp: string,
    verificationKey: string,
  ): boolean {
    try {
      const timestampPayload = timestamp + payload;
      const decodedSignature = Buffer.from(signature, 'base64');

      const verifier = crypto.createVerify('sha256');
      verifier.update(timestampPayload);
      verifier.end();

      return verifier.verify(verificationKey, decodedSignature);
    } catch {
      return false;
    }
  }

  /**
   * Validate a Twilio request signature.
   *
   * Twilio computes an HMAC-SHA1 of the full URL + sorted POST params
   * using the account's auth token.
   *
   * @see https://www.twilio.com/docs/usage/security#validating-requests
   */
  static validateTwilio(
    url: string,
    params: Record<string, string>,
    signature: string,
    authToken: string,
  ): boolean {
    try {
      // Sort the POST parameters alphabetically by key and append key=value
      const sortedKeys = Object.keys(params).sort();
      let dataString = url;
      for (const key of sortedKeys) {
        dataString += key + params[key];
      }

      const computed = crypto
        .createHmac('sha1', authToken)
        .update(dataString, 'utf8')
        .digest('base64');

      // Timing-safe comparison using buffers
      const computedBuffer = Buffer.from(computed, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');

      if (computedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }
}
