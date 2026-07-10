import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * AES-256-GCM encryption for the connections store.
 * The key lives in <dataDir>/key (mode 0600) or in FLUENTDB_SECRET (hex).
 * Threat model: protects the credentials file against backups/copies and
 * casual reads — not against an attacker with the same user privileges.
 */
export class SecretBox {
  private key: Buffer;

  constructor(dataDir: string) {
    const envKey = process.env.FLUENTDB_SECRET;
    if (envKey) {
      const key = Buffer.from(envKey, 'hex');
      if (key.length !== 32) {
        throw new Error('FLUENTDB_SECRET must be 32 bytes of hex (64 chars)');
      }
      this.key = key;
      return;
    }
    const keyPath = path.join(dataDir, 'key');
    if (fs.existsSync(keyPath)) {
      this.key = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
      if (this.key.length !== 32) {
        throw new Error(`Corrupt key file at ${keyPath}`);
      }
    } else {
      this.key = crypto.randomBytes(32);
      fs.writeFileSync(keyPath, this.key.toString('hex') + '\n', {
        mode: 0o600,
      });
    }
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString('base64');
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      'utf8',
    );
  }
}
