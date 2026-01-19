// supabase/functions/_shared/crypto.ts
// AES-256-GCM encryption utilities for chat message encryption at rest

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a string in format: base64(iv):base64(ciphertext):base64(tag)
 */
export async function encryptMessage(plaintext: string, masterKey: string): Promise<string> {
  if (!plaintext) return "";

  // Derive a 256-bit key from the master key using SHA-256
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(masterKey),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("sns-chat-encryption-v1"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  // Generate a random 12-byte IV (recommended for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the plaintext
  const encodedPlaintext = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedPlaintext
  );

  // AES-GCM appends the auth tag to the ciphertext
  const ciphertextArray = new Uint8Array(ciphertext);

  // Encode IV and ciphertext as base64
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const ciphertextBase64 = btoa(String.fromCharCode(...ciphertextArray));

  return `enc:${ivBase64}:${ciphertextBase64}`;
}

/**
 * Decrypts a message encrypted with encryptMessage.
 * Input format: enc:base64(iv):base64(ciphertext)
 * Returns the original plaintext.
 */
export async function decryptMessage(encrypted: string, masterKey: string): Promise<string> {
  if (!encrypted) return "";

  // Check if the message is encrypted (starts with "enc:")
  if (!encrypted.startsWith("enc:")) {
    // Return as-is (unencrypted legacy message)
    return encrypted;
  }

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    console.error("Invalid encrypted message format");
    return "[Decryption Error]";
  }

  const [, ivBase64, ciphertextBase64] = parts;

  try {
    // Derive the same key from the master key
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(masterKey),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode("sns-chat-encryption-v1"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    // Decode the base64 IV and ciphertext
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    return "[Decryption Error]";
  }
}

/**
 * Checks if a message is encrypted.
 */
export function isEncrypted(message: string): boolean {
  return message?.startsWith("enc:") ?? false;
}

/**
 * Gets the encryption key from environment.
 * Throws if not configured.
 */
export function getEncryptionKey(): string {
  const key = Deno.env.get("CHAT_ENCRYPTION_KEY");
  if (!key) {
    throw new Error("CHAT_ENCRYPTION_KEY environment variable not set");
  }
  if (key.length < 32) {
    throw new Error("CHAT_ENCRYPTION_KEY must be at least 32 characters");
  }
  return key;
}
