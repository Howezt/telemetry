# Changelog

## 1.0.0 (2026-02-19)


### Features

* add endpoint resolution, logger API, NodeSDK, and no-throw guarantee ([6d647ba](https://github.com/Howezt/telemetry/commit/6d647ba12912c7dc4272e6fc394a175f4e6766b2))
* add instrumentFetch utility and export from index ([0b36e58](https://github.com/Howezt/telemetry/commit/0b36e585b8cece463ec54c04f0365a66db57d149))
* add withTrace, traced decorator, CI workflows, and project tooling ([b83504c](https://github.com/Howezt/telemetry/commit/b83504c737f4fc3587ba3f90553e1b6c34d80c1d))
* extract traceHandler with W3C trace context propagation ([f16687d](https://github.com/Howezt/telemetry/commit/f16687d0f6a4f57b5628c7ad1065f090510d4a1e))
* replace traceWorkflowStep with instrumentWorkflow TC39 class decorator ([d78a8a4](https://github.com/Howezt/telemetry/commit/d78a8a4e346b5d576d0b81a8f65387b2fca88ca4))
* resource detection, validation & optional serviceName ([328967a](https://github.com/Howezt/telemetry/commit/328967a12f5d1c452a5ca784358e5a819a1fbd30))
* support parent-child spans for nested step.do calls ([e1ddea2](https://github.com/Howezt/telemetry/commit/e1ddea2da714bb1d938ce7d49fc05e49d992e89d))


### Bug Fixes

* make step spans children of workflow.run root span ([cac6d35](https://github.com/Howezt/telemetry/commit/cac6d35436b93696b56c58d24407d5f76df5d3fa))
* patch perf_hooks for CF Workers, document withTrace CPU caveat ([9f4acf1](https://github.com/Howezt/telemetry/commit/9f4acf1c35b69efd8dac54752f2d93410efc787b))
