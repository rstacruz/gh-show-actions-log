# GitHub actions log viewer

Fetch and display logs from the latest failed GitHub Actions workflow runs.

- Debug CI/CD failures from the CLI
- Works great with agentic coding tools

## Prerequisites

You need Node.js and [GitHub CLI](https://cli.github.com/manual/installation).

1. Clone this repository
2. Make the script executable (`chmod +x gh-show-actions-log.ts`)
3. Place it in a directory included in your PATH

### Examples

```bash
# Show failed runs for current repository and commit
gh-show-actions-log.ts

# or specific repo/commit:
gh-show-actions-log.ts owner/repo abcd1234
```
