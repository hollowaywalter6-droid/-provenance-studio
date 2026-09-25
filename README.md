# Provenance Studio

## Release candidate
Current web/PWA release: 4.7.0.

## iOS release gate
The web/PWA is prepared for the native Apple integration phase. A production iOS release must not be marked complete until all gates below are evidenced.

- Latest GitHub quality workflow passes on the exact release commit.
- Apple Developer membership is active.
- Final bundle identifier is registered.
- Distribution certificate and provisioning are configured.
- Production authentication providers use approved provider configuration; no private secrets are committed to this public repository.
- Native iOS package is built and signed successfully.
- Privacy manifest and permission descriptions match actual native behavior.
- TestFlight build installs and launches on a physical iPhone.
- Core journeys are repeated on the signed physical-device build: launch, navigation, writing/analysis, project persistence, file import, document processing, export/share, account controls, offline/recovery behavior, and Canvas/browser handoff where supported.
- Crash-free relaunch and upgrade/reinstall behavior are checked.
- App Store Connect metadata, privacy disclosures, screenshots, support/privacy links, and review information are complete.
- Independent release review records the exact commit, build number, device/OS tested, failures, fixes, and final result.

## Current external dependencies
PDF.js and Tesseract.js are pinned client-side dependencies. Production Apple/Google/Microsoft/Facebook identity services are not represented as working integrations until credentials and provider configuration exist.

## Release rule
Code presence is not verification. Browser emulation is not physical-iPhone verification. Disabled placeholders are not functioning integrations. The final release record must distinguish each state.
