<!-- markdownlint-disable -->
# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v1.1.3] - 2025-06-10

### Changed
- Update media constraints
- Make preloading of `rxing-wasm` optional
- Update loading of WASM & module

## [v1.1.2] - 2025-06-06

### Changed
- Use `scheduler.postTask()` to improve performance

### Deprecated
- Rename `createBarcodeReader` to `createBarcodeScanner`

## [v1.1.1] - 2025-06-05

### Fixed
- Re-add missing export of format constants

## [v1.1.0] - 2025-06-05

### Added
- Add partial fallback for non-Chromium browsers using [`rxing-wasm`](https://github.com/rxing-core/rxing-wasm/)

## [v1.0.1] - 2025-05-29

### Fixed
- Avoid use of `OffscreenCanvas` and just use `<video>` directly

## [v1.0.0] - 2025-05-01

Initial Release
