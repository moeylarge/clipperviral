import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type YoutubeHighlight = {
  index: number;
  start: number;
  end: number;
  duration: number;
  score: number;
  reason: string;
  text: string;
};

type YoutubeJob = {
  jobId: string;
  sourceUrl: string;
  sourcePath: string;
  sourceKind?: string;
  proxyOnly?: boolean;
  workdir: string;
  createdAt: number;
  clipDuration: number;
  maxClips: number;
  duration: number;
  clips: YoutubeHighlight[];
};

const JOB_TTL_MS = (() => {
  const fromEnv = Number(process.env.YOUTUBE_JOB_TTL_MINUTES || "");
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.round(fromEnv * 60 * 1000);
  }
  return 6 * 60 * 60 * 1000;
})();
const CLEANUP_INTERVAL_MS = 45 * 1000;
const jobs = new Map<string, YoutubeJob>();
const JOB_CACHE_DIR = path.join(os.tmpdir(), "spotlight-youtube-jobs");

function jobFilePath(jobId: string) {
  return path.join(JOB_CACHE_DIR, `${jobId}.json`);
}

function persistJob(job: YoutubeJob) {
  try {
    mkdirSync(JOB_CACHE_DIR, { recursive: true });
    writeFileSync(jobFilePath(job.jobId), JSON.stringify(job), "utf8");
  } catch {
    // best-effort cache
  }
}

function removeJobFile(jobId: string) {
  try {
    rmSync(jobFilePath(jobId), { force: true });
  } catch {
    // best-effort cache cleanup
  }
}

function cleanupWorkdir(workdir: unknown) {
  if (typeof workdir !== "string" || workdir.length === 0) return;
  fs.rm(workdir, { recursive: true, force: true }).catch(() => {});
}

function cleanupSingleJob(jobId: string, job: YoutubeJob) {
  jobs.delete(jobId);
  removeJobFile(jobId);
  cleanupWorkdir(job.workdir);
}

function tryLoadJobFromDisk(jobId: string) {
  const filePath = jobFilePath(jobId);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as YoutubeJob;
    if (!parsed || parsed.jobId !== jobId || typeof parsed.createdAt !== "number") {
      removeJobFile(jobId);
      return null;
    }
    if (Date.now() - parsed.createdAt > JOB_TTL_MS) {
      removeJobFile(jobId);
      cleanupWorkdir(parsed.workdir);
      return null;
    }
    jobs.set(jobId, parsed);
    return parsed;
  } catch {
    removeJobFile(jobId);
    return null;
  }
}

function cleanupJobs(now: number = Date.now()) {
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      cleanupSingleJob(jobId, job);
    }
  }
}

setInterval(() => {
  cleanupJobs();
}, CLEANUP_INTERVAL_MS).unref();

export function registerYoutubeJob(payload: Omit<YoutubeJob, "jobId" | "createdAt">) {
  const jobId = randomUUID();
  const job: YoutubeJob = {
    ...payload,
    jobId,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  persistJob(job);
  return jobId;
}

export function getYoutubeJob(jobId: string) {
  const job = jobs.get(jobId) || tryLoadJobFromDisk(jobId);
  if (!job) return null;

  if (Date.now() - job.createdAt > JOB_TTL_MS) {
    cleanupSingleJob(jobId, job);
    return null;
  }

  return {
    ...job,
    clipDuration: job.clipDuration,
    maxClips: job.maxClips,
    duration: job.duration,
    clips: [...job.clips],
  };
}

export function getYoutubeSourcePath(jobId: string) {
  const job = getYoutubeJob(jobId);
  if (!job) return null;
  return job.sourcePath;
}

export function touchYoutubeJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.createdAt = Date.now();
  persistJob(job);
}

export function getStoredJob(jobId: string) {
  const job = jobs.get(jobId) || tryLoadJobFromDisk(jobId);
  return job || null;
}

export function deleteYoutubeJob(jobId: string) {
  const job = jobs.get(jobId) || tryLoadJobFromDisk(jobId);
  if (!job) return false;
  cleanupSingleJob(jobId, job);
  return true;
}
