# GitHub Actions Log Viewer

A Node.js script to fetch and display logs from the latest failed GitHub Actions workflow runs. This tool helps you quickly debug CI/CD failures by showing detailed logs from failed jobs.

## Features

- Fetches logs from the latest failed GitHub Actions runs
- Waits for in-progress workflows to complete
- Filters by repository, workflow name, and branch
- Colour-coded output for better readability
- Automatic repository and branch detection from git context

## Prerequisites

- [GitHub CLI](https://cli.github.com/manual/installation) (`gh`) installed
- Authenticated with GitHub CLI (`gh auth login`)
- Node.js (with support for `--experimental-strip-types`)

## Installation

1. Clone this repository
2. Make the script executable:
   ```bash
   chmod +x gh-show-actions-log.ts
   ```

## Usage

```bash
./gh-show-actions-log.ts [repo] [workflow-name] [branch]
```

### Arguments

- `repo` (optional): Repository in format `owner/repo`. If not provided, detects from git remote.
- `workflow-name` (optional): Filter by workflow name (partial match).
- `branch` (optional): Filter by branch. If not provided, uses current git branch.

### Examples

Show failed runs for current repository and branch:
```bash
./gh-show-actions-log.ts
```

Show failed runs for specific repository:
```bash
./gh-show-actions-log.ts owner/repo
```

Show failed runs for specific workflow:
```bash
./gh-show-actions-log.ts owner/repo ci
```

Show failed runs for specific branch:
```bash
./gh-show-actions-log.ts owner/repo ci main
```

## How it works

1. Checks GitHub CLI installation and authentication
2. Detects repository and branch from git context if not provided
3. Lists recent workflow runs (both running and failed)
4. For running workflows, waits for completion (up to 20 minutes)
5. Fetches and displays logs from failed jobs
6. Formats output with colour coding for better readability

## Output format

The script displays:
- Workflow run information (name, ID, branch)
- Failed job details
- Complete job logs in code blocks
- Colour-coded status messages

## License

MIT License
