# Kanban Studio

The static-export frontend for the Project Management MVP. It needs the FastAPI backend for every API call, so run the full app with the scripts in the root `scripts/` directory.

## Tests

```bash
npm run lint
npm run test:unit
npm run test:e2e
```

`npm run test:e2e` builds and starts a separate Docker Compose project (`pm-e2e`, port 8001) with its own database, then removes it when the run ends.
