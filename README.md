# BRIDGE

Website for **BRIDGE** — a hybrid architecture connecting [OGDF](https://www.ogdf.uni-osnabrueck.de) (C++) to GAV-VR (C#) via automated Lua bindings.

Built as the companion site for the master thesis *"Connecting OGDF to GAV-VR — Design Concept and Realisation"* (University of Konstanz, 2025).

## Features

- **Live demo** — run OGDF layout algorithms (energy-based, hierarchical, orthogonal, PivotMDS) on example graphs and compare results side by side in a 3D viewer.
- **Architecture & evaluation** sections describing the dual execution model (native P/Invoke & network REST) and the whitelist security policy.
- **Reproducibility** — C++ and Lua sources for every case study under `examples/`, plus GraphML test graphs.

## Project structure

```
index.html          Main single-page site
privacy.html        Privacy policy
assets/css/         Styles
js/
  main.js           Entry point
  api/              Engine client (REST calls to the runner)
  config/           Site configuration (compatibility matrix, stages, links)
  graph/            GraphML parser + 3D graph viewer (three.js)
  ui/               Demo controls, code tabs, parameter forms, etc.
examples/
  cpp/              C++ sources for the case studies
  lua/              Lua sources for the case studies
  graphml/          Example graphs
```

## Running locally

The site is fully static — no build step required. Serve it with any static server (needed because ES modules don't load from `file://`):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Configuration

Site-wide settings live in `js/config/siteConfig.js`:

- `METHOD_GRAPH_COMPATIBILITY` — which layout methods run on which example graphs.
- `EXECUTION_STAGES` — progress stages reported by the runner.
- `RESOURCE_LINKS` / `THESIS_BIBTEX` — external links and citation.

## Tech

Plain HTML/CSS/JS (ES modules), [three.js](https://threejs.org) via import map for the 3D viewer, no framework, no build tooling.
