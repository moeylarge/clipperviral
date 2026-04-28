import { createClient, type RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedisClient() {
  if (redisClient && redisClient.isOpen) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("Redis is not configured. Missing REDIS_URL.");
  }

  redisClient = createClient({
    url,
    ...(process.env.REDIS_TOKEN ? { password: process.env.REDIS_TOKEN } : {}),
  });

  redisClient.on("error", (error) => {
    console.error("Redis error", error);
  });

  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  return redisClient;
}
