# GitHub Actions Log Viewer

A Node.js script to fetch and display logs from the latest failed GitHub Actions workflow runs. This tool helps you quickly debug CI/CD failures by showing detailed logs from failed jobs.

## Prerequisites

- [GitHub CLI](https://cli.github.com/manual/installation) (`gh`) installed
- Node.js

## Installation

1. Clone this repository
2. Make the script executable:
   ```bash
   chmod +x gh-show-actions-log.ts
   ```

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

## License

MIT License
