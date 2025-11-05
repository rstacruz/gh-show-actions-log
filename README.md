# GitHub actions log viewer

Fetch and display logs from the latest failed GitHub Actions workflow runs.

- Debug CI/CD failures from the CLI
- Works great with agentic coding tools

## Prerequisites

You need Node.js and [GitHub CLI](https://cli.github.com/manual/installation).

1. Download [`gh-show-actions-log`](https://github.com/rstacruz/gh-show-actions-log/raw/refs/heads/main/gh-show-actions-log) to a directory included in your PATH
2. Make the script executable (`chmod +x gh-show-actions-log`)

### Examples

```bash
# Show failed runs for current repository and commit
gh-show-actions-log

# or specific repo/commit:
gh-show-actions-log owner/repo abcd1234
```

## Suggested use cases

- Ask your favourite AI coding assistant to fix CI failures:

  ```
  Run `gh-show-actions-log` to view errors and address them if any
  ```

- Add this to your global AGENTS.md for your favourite AI coding assistant. Think of it as if you just added a GitHub Actions MCP.

  ```
  You have access to the `gh-show-actions-log` CLI tool. It shows test status for the current commit in GitHub Actions, and show logs for failures. If a run is pending, it waits until it completes. Use this to query status or show logs from GitHub Actions CI.
  ```

- Mark a draft PR as ready for review as soon as it passes:

  ```sh
  gh-show-actions-log && gh pr ready
  ```

- Get alerted when CI fails or succeeds:

  ```sh
  gh-show-actions-log && say "CI passed!" || say "CI failed!"
  ```

- Show logs after pushing code:

  ```sh
  git push && gh-show-actions-log
  ```
