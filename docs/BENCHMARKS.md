# Benchmarks

Run:

```bash
node benchmarks/run.mjs
```

Measured scenarios:

- compile
- run
- compile + run facade

These numbers are intended for relative regression tracking, not as a universal SLA.


## What is measured

- `compile`: artifact normalization, schema checks, reference checks, DAG checks, and compiled artifact creation.
- `run`: in-memory pipeline execution on an already compiled artifact.
- `compile+run`: facade-style end-to-end measurement for convenience scenarios.
- Benchmarks do not include I/O, network, storage, orchestration, or operator-side external calls. They are not SLA numbers.

## How to read the numbers

Use them to compare library revisions on the same machine and Node.js version. Do not treat them as production latency promises.
