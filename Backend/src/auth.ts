import { betterAuth } from "better-auth";
import { pool } from "./db.js";

function requireEnv(name: string) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is missing. Add it in Backend/.env.`);
    }
    return value;
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:8080";
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const googleClientId = requireEnv("GOOGLE_CLIENT_ID");
const googleClientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
const betterAuthSecret = requireEnv("BETTER_AUTH_SECRET");

export const auth = betterAuth({
    baseURL,
    secret: betterAuthSecret,
    trustedOrigins: [frontendOrigin],
    database: pool,
    emailAndPassword: {
        enabled: true
    },
    socialProviders: {
        google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret
        }
    }
});
