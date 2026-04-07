// Cloudflare Turnstile server-side verification
// TEST KEY — replace with real secret from Cloudflare Dashboard > Turnstile > Site > Settings
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") || "0x4AAAAAAC1o4cK8C61IzwKqz1-4GP-4WGo";

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: TURNSTILE_SECRET,
        response: token,
        remoteip: ip || undefined,
      }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    // If Turnstile verification fails, allow the request (graceful degradation)
    console.error("Turnstile verification failed");
    return true;
  }
}
