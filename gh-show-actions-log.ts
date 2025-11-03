#!/usr/bin/env -S node --experimental-strip-types

/**
 * Script to print logs from latest test failures in GitHub Actions
 */

import { execSync } from "node:child_process";

const BIN = process.argv[1]


// TypeScript type definitions
interface ExecCommandOptions {
  silent?: boolean;
  ignoreError?: boolean;
  execSyncOptions?: Parameters<typeof execSync>[1];
}

interface ExecCommandSuccess {
  ok: true;
  result: string;
}

interface ExecCommandFailure {
  ok: false;
  code?: number;
}

type ExecCommandResult = ExecCommandSuccess | ExecCommandFailure;

// Constants
const LIMIT = 1;
const TIMEOUT = 1200; // 20 minutes in seconds
const INTERVAL = 10; // 10 seconds

// ANSI color codes
const colors = {
  bold: "\x1b[0;1m",
  red: "\x1b[0;31m",
  green: "\x1b[0;32m",
  yellow: "\x1b[1;33m",
  blue: "\x1b[0;34m",
  reset: "\x1b[0m",
};

// Output helper class
class Output {
  static log(text = "") {
    console.log(text);
  }

  static error(text: string) {
    console.error(`${colors.red}Error: ${text}${colors.reset}`);
  }

  static success(text: string) {
    console.log(`${colors.green}${text}${colors.reset}`);
  }

  static warning(text: string) {
    console.log(`${colors.yellow}${text}${colors.reset}`);
  }

  static h1(text: string) {
    console.log(`${colors.bold}${colors.blue}# ${text}${colors.reset}`);
    console.log();
  }

  static h2(text: string) {
    console.log(`${colors.bold}${colors.blue}## ${text}${colors.reset}`);
    console.log();
  }

  static h3(text: string) {
    console.log(`${colors.bold}${colors.blue}### ${text}${colors.reset}`);
    console.log();
  }
}

// GitHub CLI wrapper class
class GhCli {
  static checkAuth() {
    return execCommand("gh auth status", { silent: true });
  }

  static getRepo() {
    return execCommand("gh repo view --json nameWithOwner -q '.nameWithOwner'", { silent: true, ignoreError: true });
  }

  static getWorkflowId(workflowName: string) {
    return execCommand(`gh workflow list --json name,id --jq '.[] | select(.name | contains("${workflowName}")) | .id'`, { silent: true });
  }

  static getRunStatus(repo: string, runId: number) {
    return execCommand(`gh run view --repo "${repo}" "${runId}" --json status,conclusion --jq '.'`, { silent: true });
  }

  static listRuns(repo: string, limit: number, filter: string) {
    const jqFilter = filter === 'running'
      ? '.[] | select(.status == "in_progress")'
      : '.[] | select(.conclusion == "failure")';
    return execCommand(`gh run list --repo "${repo}" --limit "${limit}" --json databaseId,headBranch,workflowName,createdAt,status,conclusion --jq '${jqFilter}'`, { silent: true });
  }

  static getFailedJobs(repo: string, runId: number) {
    return execCommand(`gh run view --repo "${repo}" "${runId}" --json jobs --jq '.jobs[] | select(.conclusion == "failure") | {name: .name, databaseId: .databaseId}'`, { silent: true });
  }

  static getJobLogs(repo: string, jobId: number) {
    return execCommand(`gh run view --repo "${repo}" --job "${jobId}" --log`, { silent: true });
  }
}

// Git CLI wrapper class
class GitCli {
  static getCurrentBranch() {
    return execCommand("git branch --show-current", { silent: true });
  }

  static getRemoteUrl() {
    return execCommand("git remote get-url origin", { silent: true });
  }
}

/** Executes a shell command and returns a structured result */
function execCommand(command: string, options: ExecCommandOptions = {}): ExecCommandResult {
  try {
    const result = execSync(command, {
      encoding: "utf-8",
      stdio: options.silent ? "pipe" : "inherit",
      ...options,
    }).trim();

    return { ok: true, result };
  } catch (error: unknown) {
    if (options.ignoreError) {
      return { ok: true, result: "" };
    }
    return { ok: false, code: ((error as any).status || 1) as number };
  }
}

function checkDependencies() {
  // Check if gh CLI is installed
  const ghCheck = execCommand("command -v gh", { silent: true });
  if (!ghCheck.ok) {
    Output.error("GitHub CLI (gh) is not installed. Please install it first.");
    Output.log("Visit: https://cli.github.com/manual/installation");
    process.exit(1);
  }

  // Check if user is authenticated
  const authCheck = GhCli.checkAuth();
  if (!authCheck.ok) {
    Output.error("Not authenticated with GitHub CLI. Run 'gh auth login' first.");
    process.exit(1);
  }
}

function getCurrentBranch(): ExecCommandResult {
  return GitCli.getCurrentBranch();
}

function getRepository(): ExecCommandResult {
  const repoResult = GhCli.getRepo();
  if (repoResult.ok) {
    return repoResult;
  }

  // Try getting from git remote
  const remoteUrlResult = GitCli.getRemoteUrl();
  if (remoteUrlResult.ok) {
    const match = remoteUrlResult.result.match(/github\.com[:/](.*)\.git/);
    return match && match[1] ? { ok: true, result: match[1] } : { ok: false, code: 1 };
  }

  return { ok: false, code: 1 };
}

function getWorkflowId(workflowName: string): string {
  if (!workflowName) return "";

  const outputResult = GhCli.getWorkflowId(workflowName);
  return outputResult.ok ? outputResult.result.split("\n")[0] || "" : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonLines(output: string): any[] {
  if (!output) return [];

  return output
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function waitForWorkflowCompletion(repo: string, runId: number): Promise<any | null> {
  let elapsed = 0;

  while (elapsed < TIMEOUT) {
    const outputResult = GhCli.getRunStatus(repo, runId);
    if (outputResult.ok) {
      try {
        const currentRun = JSON.parse(outputResult.result);

        if (currentRun.status !== "in_progress") {
          return currentRun;
        }

        process.stdout.write(".");
        await sleep(INTERVAL * 1000);
        elapsed += INTERVAL;
        continue;
      } catch (error) {
        Output.error(`Failed to parse run status: ${(error as Error).message}`);
        return null;
      }
    } else {
      Output.error("Failed to check run status");
      return null;
    }
  }

  Output.log();
  Output.warning("Timeout reached. Workflow may still be running.");
  return null;
}

async function processRunningRuns(repo: string, limit: number): Promise<any[]> {
  const failedRuns: any[] = [];

  const outputResult = GhCli.listRuns(repo, limit, 'running');
  if (outputResult.ok) {
    const runs = parseJsonLines(outputResult.result);

    for (const run of runs) {
      Output.h2(
        `Running workflow '${run.workflowName}' (run ID: ${run.databaseId})`,
      );
      Output.log("This run is in progress. Waiting for completion...");

      const completedRun = await waitForWorkflowCompletion(
        repo,
        run.databaseId,
      );
      Output.log();

      if (completedRun?.conclusion === "failure") {
        failedRuns.push({ ...run, conclusion: "failure" });
      }
    }
  }

  return failedRuns;
}

function getFailedRuns(repo: string, limit: number): any[] {
  const outputResult = GhCli.listRuns(repo, limit, 'failed');
  return outputResult.ok ? parseJsonLines(outputResult.result) : [];
}

function getFailedJobs(repo: string, runId: number): any[] {
  const outputResult = GhCli.getFailedJobs(repo, runId);
  return outputResult.ok ? parseJsonLines(outputResult.result) : [];
}

function getJobLogs(repo: string, jobId: number): string | null {
  const logsResult = GhCli.getJobLogs(repo, jobId);
  return logsResult.ok ? logsResult.result : null;
}

async function processFailedRuns(repo: string, failedRuns: any[]): Promise<void> {
  for (const run of failedRuns) {
    Output.h2(
      `Failed run for workflow '${run.workflowName}' (run ID: ${run.databaseId})`,
    );
    Output.log();

    const jobs = getFailedJobs(repo, run.databaseId);

    if (jobs.length === 0) {
      Output.warning("No failed jobs found for this run.");
      Output.log();
      continue;
    }

    for (const job of jobs) {
      Output.h3(`Failed Job: ${job.name} (id: ${job.databaseId})`);

      Output.log("`````");
      const logs = getJobLogs(repo, job.databaseId);
      if (logs) {
        Output.log(logs);
        Output.log();
      } else {
        Output.warning(`Could not fetch logs for job ${job.databaseId}`);
      }
      Output.log("`````");
      Output.log();
    }

    Output.warning("Workflow run failed, see logs above for details.");
  }
}

async function main(): Promise<void> {
  // Parse arguments
  const args = process.argv.slice(2);
  let repo = args[0];
  const workflowName = args[1] || "";
  let branch = args[2];

  // Get repository if not provided
  if (!repo) {
    const repoResult = getRepository();
    if (repoResult.ok) {
      repo = repoResult.result;
    } else {
      Output.error("Could not determine repository. Please provide it as first argument.");
      Output.log(`Usage: ${BIN} [repo] [workflow-name] [branch]`);
      Output.log(`Example: ${BIN} owner/repo ci main`);
      process.exit(1);
    }
  }

  // Get branch if not provided
  if (!branch) {
    const branchResult = getCurrentBranch();
    if (branchResult.ok) {
      branch = branchResult.result;
    } else {
      Output.error("Could not determine current branch. Please provide it as third argument.");
      Output.log(`Usage: ${BIN} [repo] [workflow-name] [branch]`);
      Output.log(`Example: ${BIN} owner/repo ci main`);
      process.exit(1);
    }
  }

  // Check dependencies
  checkDependencies();

  Output.h1(`Latest GitHub Actions run for ${repo} (${branch})`);

  // Get workflow ID if name is provided
  if (workflowName) {
    const workflowId = getWorkflowId(workflowName);
    if (!workflowId) {
      Output.error(`No workflow found containing '${workflowName}'.`);
      process.exit(1);
    }
  }

  // Process running runs
  const runningFailures = await processRunningRuns(repo, LIMIT);

  // Get failed runs
  let failedRuns = runningFailures.length > 0 ? runningFailures : getFailedRuns(repo, LIMIT);

  if (failedRuns.length === 0) {
    if (runningFailures.length === 0) {
      Output.success(
        `Success! No failed or running workflow runs for branch '${branch}'.`,
      );
    }
    process.exit(0);
  }

  // Process failed runs
  await processFailedRuns(repo, failedRuns);
}

main().catch((error: Error) => {
  Output.error(error.message);
  process.exit(1);
});

