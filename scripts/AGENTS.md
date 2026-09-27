# Script Instructions

This directory contains lifecycle scripts for the local Docker application.

- Windows: `start.ps1` and `stop.ps1`.
- macOS and Linux: `start.sh` and `stop.sh`.
- Start scripts accept an optional port and use Docker Compose's health check before reporting success.
- Run scripts from any current directory; each resolves the repository root from its own location.