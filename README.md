# Playwright Solution Visualizer

A generic, configuration-driven interactive architecture map and diff analyzer for Playwright test automation codebases.

The Playwright Solution Visualizer crawls your automated test workspace extracting Page Object Models, API models, workflows, components, and end-to-end regression suites and renders them onto an interactive infinite canvas. It features a dual-timeline diffing engine that compares any two historical suite snapshots to highlight added, removed, and modified files and tests in real time.

### Key Features

- Interactive Infinite Canvas: Pan and zoom smoothly across your entire test architecture with connection lines tracing module dependencies and references.

- Dual-Timeline Diffing Engine: Select any target and baseline snapshots to instantly inspect diffs across test cases and file structures.

- Configuration-Driven Mapping: Define scanned directories, section types (test, class, functions), project tags, and icons using a single visualizer-config.json.

- Dynamic Metrics Summary: High-density anchor cards automatically aggregate suite totals, project tag breakdowns, and file tree diffs.

- Zero External Web Framework Dependencies: Runs on pure ES modules, standard DOM APIs, and Node.js without heavy frontend build steps.

## Quick Start

### Run the Workspace Crawler

Generate your initial snapshot by running the crawler script from your project root:

```bash
node visualizer/sync-visualizer.js
```

This script parses configured directories, extracts AST/regex items and module imports, generates a timestamped snapshot `data/snapshot-DD-MM-YY-HHMMSS.json` and updates `data/index.json`.

### Launch the Visualizer

Use a local static web server (e.g. `VS Code Live Server`, `npx serve`)

## Configuration

Customize how your codebase is scanned and organized by editing `visualizer-config.json`.
Scan Types (type)
- `test`: Parses Playwright test('name', ...) calls and renders full file/folder breakdown trees with test item diffing.
- `class`: Parses exported TypeScript/JavaScript classes and their public/async methods.
- `functions`: Parses standalone exported function declarations.