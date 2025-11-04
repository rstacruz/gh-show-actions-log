#!/usr/bin/env -S node --experimental-strip-types

/**
 * Script to print logs from latest test failures in GitHub Actions
 */

import { execSync } from 'node:child_process'
import { basename } from 'node:path'

const BIN = basename(process.argv[1] ?? 'gh-show-actions-log')

type ExecCommandSuccess = { ok: true; result: string }
type ExecCommandFailure = { ok: false; code?: number }
type ExecCommandResult = ExecCommandSuccess | ExecCommandFailure

// Constants
const LIMIT = 1
const TIMEOUT = 1200 // 20 minutes in seconds
const INTERVAL = 10 // 10 seconds

// ANSI color codes
const colors = {
  bold: '\x1b[0;1m',
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
}

/** The main action */
class ShowLogAction {
  static checkDependencies() {
    // Check if gh CLI is installed
    const ghCheck = Util.execCommand('command -v gh', { silent: true })
    if (!ghCheck.ok) {
      Output.error('GitHub CLI (gh) is not installed. Please install it first.')
      Output.log('Visit: https://cli.github.com/manual/installation')
      process.exit(1)
    }

    // Check if user is authenticated
    const authCheck = GhCli.checkAuth()
    if (!authCheck.ok) {
      Output.error(
        "Not authenticated with GitHub CLI. Run 'gh auth login' first.",
      )
      process.exit(1)
    }
  }

  static showUsageAndExit(error: string): never {
    Output.error(error)
    Output.log(`Usage: ${BIN} [repo] [commit-sha] [workflow-name]`)
    Output.log(`Example: ${BIN} owner/repo abc1234 ci`)
    Output.log(
      `Example: ${BIN}                    # current repo, current commit`,
    )
    Output.log(`Example: ${BIN} owner/repo abc1234  # specific repo and commit`)
    process.exit(1)
  }

  static getRepository(): ExecCommandResult {
    const repoResult = GhCli.getRepo()
    if (repoResult.ok) return repoResult

    // Try getting from git remote
    const remoteUrlResult = GitCli.getRemoteUrl()
    if (remoteUrlResult.ok) {
      const match = remoteUrlResult.result.match(/github\.com[:/](.*)\.git/)
      return match?.[1]
        ? { ok: true, result: match[1] }
        : { ok: false, code: 1 }
    }

    return { ok: false, code: 1 }
  }

  static async processRunningRuns(
    repo: string,
    limit: number,
    commitSha: string,
  ): Promise<void> {
    let elapsed = 0

    while (elapsed < TIMEOUT) {
      const runningRuns = GhCli.listAllRuns(repo, limit, commitSha).filter(
        (run) => run.status === 'in_progress',
      )

      if (runningRuns.length === 0) {
        break
      }

      await Util.sleep(INTERVAL * 1000)
      elapsed += INTERVAL
    }

    if (elapsed >= TIMEOUT) {
      Output.warning('Timeout reached. Workflow may still be running.')
    }
  }

  static displayRunSummary(runs: any[]): void {
    if (runs.length === 0) {
      Output.success(`No workflow runs found`)
      return
    }

    for (const run of runs) {
      const status = Util.formatStatus(run.status, run.conclusion)
      const duration = Util.formatDuration(run.startedAt, run.updatedAt)
      Output.log(
        `- ${status}: ${run.workflowName} / ${run.event} (${duration})`,
      )
    }
  }

  static async processFailedRuns(
    repo: string,
    failedRuns: any[],
  ): Promise<void> {
    for (const run of failedRuns) {
      Output.h2(
        `Failed run for workflow '${run.workflowName}' (run ID: ${run.databaseId})`,
      )
      Output.log()

      const jobs = GhCli.getFailedJobsFromRun(repo, run.databaseId)

      if (jobs.length === 0) {
        Output.warning('No failed jobs found for this run.')
        Output.log()
        continue
      }

      for (const job of jobs) {
        Output.h3(`Failed Job: ${job.name} (id: ${job.databaseId})`)

        Output.log('`````')
        const logs = GhCli.getJobLogsFromRepo(repo, job.databaseId)
        if (logs) {
          Output.log(logs)
          Output.log()
        } else {
          Output.warning(`Could not fetch logs for job ${job.databaseId}`)
        }
        Output.log('`````')
        Output.log()
      }

      Output.warning('Workflow run failed, see logs above for details.')
    }
  }

  static async main(): Promise<void> {
    // Parse arguments
    const args = process.argv.slice(2)
    let repo = args[0]
    let commitSha = args[1]
    const workflowName = args[2] || ''

    // Get repository if not provided
    if (!repo) {
      const repoResult = ShowLogAction.getRepository()
      if (repoResult.ok) {
        repo = repoResult.result
      } else {
        ShowLogAction.showUsageAndExit(
          'Could not determine repository. Please provide it.',
        )
      }
    }

    // Validate that if repo was explicitly provided, commit must also be provided
    if (args[0] && !args[1]) {
      ShowLogAction.showUsageAndExit(
        'When specifying a repository, you must also specify a commit SHA.',
      )
    }

    // Get SHA if not provided
    if (!commitSha) {
      const shaResult = GitCli.getCurrentSha()
      if (shaResult.ok) {
        commitSha = shaResult.result
      } else {
        ShowLogAction.showUsageAndExit(
          'Could not determine current commit SHA. Please provide it.',
        )
      }
    }

    // Validate SHA format
    if (!Util.validateSha(commitSha)) {
      Output.error(
        `Invalid SHA format: '${commitSha}'. Must be 7-40 hex characters.`,
      )
      process.exit(1)
    }

    // Check dependencies
    ShowLogAction.checkDependencies()

    // Get workflow ID if name is provided
    if (workflowName) {
      const workflowResult = GhCli.getWorkflowId(workflowName, repo)
      const workflowId = workflowResult.ok
        ? workflowResult.result.split('\n')[0] || ''
        : ''
      if (!workflowId) {
        Output.error(`No workflow found containing '${workflowName}'.`)
        process.exit(1)
      }
    }

    const shortSha = commitSha.substring(0, 7)

    Output.h1(`GitHub Actions logs for ${repo} @ ${shortSha}`)

    // Process running runs
    await ShowLogAction.processRunningRuns(repo, LIMIT, commitSha)

    // Fetch all runs for the commit and display summary
    const allRuns = GhCli.listAllRuns(repo, LIMIT, commitSha)
    ShowLogAction.displayRunSummary(allRuns)

    // Get failed runs
    const failedRuns = allRuns.filter((run) => run.conclusion === 'failure')

    if (failedRuns.length === 0) {
      process.exit(0)
    }

    // Process failed runs
    await ShowLogAction.processFailedRuns(repo, failedRuns)
  }
}

/** GitHub CLI wrapper class */
class GhCli {
  static checkAuth() {
    return Util.execCommand('gh auth status', { silent: true })
  }

  static getRepo() {
    return Util.execCommand(
      "gh repo view --json nameWithOwner -q '.nameWithOwner'",
      { silent: true, ignoreError: true },
    )
  }

  static getWorkflowId(workflowName: string, repo: string) {
    return Util.execCommand(
      `gh workflow list --repo "${repo}" --json name,id --jq '.[] | select(.name | contains("${workflowName}")) | .id'`,
      { silent: true },
    )
  }

  static listAllRuns(repo: string, limit: number, commitSha?: string): any[] {
    const commitFlag = commitSha ? `--commit=${commitSha}` : ''
    const outputResult = Util.execCommand(
      `gh run list --repo "${repo}" ${commitFlag} --limit "${limit}" --json databaseId,headBranch,workflowName,createdAt,status,conclusion,startedAt,updatedAt,event --jq '.[]'`,
      { silent: true },
    )
    return outputResult.ok ? Util.parseJsonLines(outputResult.result) : []
  }

  static getFailedJobsFromRun(repo: string, runId: number): any[] {
    const outputResult = Util.execCommand(
      `gh run view --repo "${repo}" "${runId}" --json jobs --jq '.jobs[] | select(.conclusion == "failure") | {name: .name, databaseId: .databaseId}'`,
      { silent: true },
    )
    return outputResult.ok ? Util.parseJsonLines(outputResult.result) : []
  }

  static getJobLogsFromRepo(repo: string, jobId: number): string | null {
    const logsResult = Util.execCommand(
      `gh run view --repo "${repo}" --job "${jobId}" --log`,
      { silent: true },
    )
    return logsResult.ok ? logsResult.result : null
  }
}

/** Git CLI wrapper class */
class GitCli {
  static getCurrentSha() {
    return Util.execCommand('git rev-parse HEAD', { silent: true })
  }

  static getRemoteUrl() {
    return Util.execCommand('git remote get-url origin', { silent: true })
  }
}

/** Output helper class */
class Output {
  static log(text: string = '') {
    console.log(text)
  }

  static error(text: string) {
    console.error(`${colors.red}Error: ${text}${colors.reset}`)
  }

  static success(text: string) {
    console.log(`${colors.green}${text}${colors.reset}`)
  }

  static warning(text: string) {
    console.log(`${colors.yellow}${text}${colors.reset}`)
  }

  static h1(text: string) {
    console.log(`${colors.bold}${colors.blue}# ${text}${colors.reset}`)
    console.log()
  }

  static h2(text: string) {
    console.log(`${colors.bold}${colors.blue}## ${text}${colors.reset}`)
    console.log()
  }

  static h3(text: string) {
    console.log(`${colors.bold}${colors.blue}### ${text}${colors.reset}`)
    console.log()
  }
}

/** Reusable utilities */
class Util {
  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  static parseJsonLines(output: string): any[] {
    if (!output) return []

    return output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
  }

  static validateSha(sha: string): boolean {
    if (!sha) return false
    return /^[a-f0-9]{7,40}$/i.test(sha)
  }

  static formatStatus(status: string, conclusion: string | null): string {
    if (status === 'in_progress') {
      return `${colors.blue}RUNNING${colors.reset}`
    }

    switch (conclusion) {
      case 'success':
        return `${colors.green}SUCCESS${colors.reset}`
      case 'failure':
        return `${colors.red}FAILURE${colors.reset}`
      case 'cancelled':
        return `${colors.yellow}CANCELLED${colors.reset}`
      case 'skipped':
        return `${colors.dim}SKIPPED${colors.reset}`
      default:
        return 'UNKNOWN'
    }
  }

  static formatDuration(
    startedAt: string | null,
    updatedAt: string | null,
  ): string {
    if (!startedAt || !updatedAt) {
      return 'N/A'
    }

    const start = new Date(startedAt)
    const end = new Date(updatedAt)
    const diffMs = end.getTime() - start.getTime()
    const seconds = Math.round(diffMs / 1000)

    return `${seconds}s`
  }

  static execCommand(
    command: string,
    options: {
      silent?: boolean
      ignoreError?: boolean
      execSyncOptions?: Parameters<typeof execSync>[1]
    } = {},
  ): ExecCommandResult {
    try {
      const result = execSync(command, {
        encoding: 'utf-8',
        stdio: options.silent ? 'pipe' : 'inherit',
        ...options,
      }).trim()

      if (process.env.DEBUG) {
        Output.log(
          `> Running \`\`${command}\`\` => \`\`${JSON.stringify(result).substring(0, 50)}\`\``,
        )
      }

      return { ok: true, result }
    } catch (error: unknown) {
      if (process.env.DEBUG) {
        Output.log(`> Running \`\`${command}\`\` => error`)
      }

      if (options.ignoreError) {
        return { ok: true, result: '' }
      }
      return { ok: false, code: ((error as any).status || 1) as number }
    }
  }
}

ShowLogAction.main().catch((error: Error) => {
  Output.error(error.message)
  process.exit(1)
})
