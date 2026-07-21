# Fail-Closed Face Liveness and Legacy Re-enrollment

## Objective
Close a confirmed critical presentation/replay vulnerability: a photograph of Ali Raza Khan displayed on a mobile screen was successfully enrolled and then used for kiosk punch-in and punch-out. Replace single-frame similarity-only trust with fail-closed active liveness, invalidate all legacy face profiles for authentication, and require secure re-enrollment.

## Security posture
This is a security control, not a cosmetic face-quality improvement.

- Existing v2 face descriptors are untrusted and MUST NOT be accepted for HR verification or kiosk attendance.
- New enrollment creates only v3 descriptors carrying a successful `active-turn-v1` liveness attestation.
- Saving a new secure enrollment replaces all prior face descriptors for that employee; do not append legacy samples.
- Every camera punch requires a new, one-time, short-lived randomized liveness challenge plus face comparison. Enrollment liveness alone is insufficient.
- Camera punch requires the full employee code/ID. Remove/override settings paths that allow code-free camera recognition or auto-capture without an interactive challenge.
- Fingerprint remains available and is the operational fallback.
- Do not claim ISO/NIST-certified PAD. Label this `Active liveness` / `photo replay protection`; recorded-video/deepfake resistance ultimately requires a tested PAD SDK or depth/IR hardware.

## Threat model and required attack resistance
Must reject:
- Static printed photograph.
- Static photograph displayed on a phone/tablet.
- Moving the phone left/right while the displayed face itself remains frontal.
- Reuse/replay of a prior successful challenge payload or expired challenge.
- Forged `meta.liveness=true` without a live challenge issued by the privileged kiosk main process.
- IP-camera still images for face attendance because they cannot provide a trustworthy temporal live webcam sequence.

## Active liveness design
Use browser `FaceDetector` with facial landmarks. Fail closed if FaceDetector or the required eye/nose landmark geometry is unavailable.

Challenge sequence:
1. Establish stable centered neutral pose for multiple frames.
2. Privileged main process randomly selects LEFT-then-RIGHT or RIGHT-then-LEFT.
3. User turns their actual head in the requested first direction while keeping the face box centered and similar size.
4. Return to neutral.
5. Turn in the opposite requested direction.
6. Return to neutral and capture the descriptor/evidence.

Yaw must be derived from internal landmark geometry (nose displacement relative to eye midpoint/eye distance), not merely face-box movement. Reject if the face box translates too much or changes scale excessively; this specifically prevents passing by sliding a flat phone/photo. Require minimum consecutive frames per phase and reasonable total duration.

## Privileged kiosk challenge
- Add a preload IPC method to begin a camera liveness challenge.
- Main process creates a cryptographically random challenge ID, randomized direction order, issue time, expiry (roughly 20–30 seconds), and single-use state in memory.
- Renderer displays and measures the challenge, returning bounded observation summaries/proof.
- Main validates challenge ID, expiry, sequence, directions, frame counts, timing, landmark yaw amplitudes, stable center/scale, and single use before face matching.
- Consume the challenge on any punch verification attempt so it cannot be replayed.
- Never accept a boolean liveness claim by itself.
- Add failure throttling: after five liveness/camera failures, impose at least a 30-second camera lockout. Successful verified punch resets the relevant failure counter.

## HR enrollment and verification
- Add reusable TypeScript liveness utilities/state-machine helpers with pure tests.
- `Save 3 Faces` first runs the randomized active challenge, then takes three quality-checked descriptor samples and marks each v3 descriptor with the verified liveness method/time/challenge summary.
- Replace existing descriptors with the three secure samples.
- `Verify Face` also requires a fresh active challenge before matching.
- Employees with only v1/v2 descriptors show `Re-enrollment required`, not `Face enrolled`.
- Counts and recognition use only secure v3 descriptors.
- Provide clear live status: Center face → Turn left/right → Return center → Turn opposite → Verified.
- If landmarks/PAD capability is unavailable, show a blocking message and direct HR to use the supported Windows desktop build or fingerprint. Never fall back to old pixel/skin heuristics for liveness.

## Kiosk renderer UX
- Camera tab always requires employee code and live webcam.
- Disable/reject IP-camera attendance with a specific security explanation.
- Manual Capture starts the randomized liveness challenge. If legacy auto-capture is enabled, it may automatically start a challenge after a stable face is detected, but it must never punch without completing the interactive sequence.
- Display the current action prominently above the camera, with progress steps and timeout feedback.
- Error text distinguishes: legacy enrollment, liveness capability unavailable, photo/no pose change, expired challenge, lockout, face mismatch.
- On success, retain existing evidence display and attendance result.

## Descriptor schema
Extend face descriptor typing safely:
- v3 vector keeps the current comparison representation for compatibility of comparison math.
- Required liveness attestation fields include method `active-turn-v1`, verified timestamp, and bounded non-sensitive challenge summary.
- Never include raw biometric frames in the liveness proof stored on the employee unless the existing evidence policy explicitly requires it.
- `getFaceDescriptors` must return only v3 descriptors with valid attestation for authentication.

## Electron/platform support
- Enable Chromium FaceDetection in both the HR Windows Electron app and kiosk Electron app.
- Maintain context isolation and existing CSP.
- Do not enable Node integration or expose arbitrary IPC.

## Tests
Add focused pure tests for:
- Legacy v1/v2 descriptors excluded; valid attested v3 accepted.
- Missing/invalid liveness attestation excluded.
- Correct center/left/center/right/center sequence passes.
- Wrong direction, insufficient yaw, translated flat-photo motion, excessive scale change, insufficient frames, timeout fail.
- Challenge order randomized but validation deterministic from issued challenge.
- Expired and reused challenge IDs fail.
- Boolean-only/forged proof fails.
- Five failures cause 30-second lockout and successful verification resets it.
- Main camera handler rejects missing code, IP camera, insecure enrollment, and missing/invalid challenge before face comparison/savePunch.

## Aesthetic direction
Keep the existing blue/emerald biometric console and dark kiosk styling. Make the memorable security element a compact, unmistakable live challenge rail with five states. Use amber for waiting/action, emerald for completed phases, rose for rejection/lockout. Avoid decorative redesign.

## Typography and layout
Retain existing typography. Challenge text must be large enough for kiosk distance. Enrollment rail must fit existing card at phone/tablet/desktop widths. No overflow or compressed four-column controls.

## Image needs
None.

## Expected files
- `src/utils/faceRecognition.ts`
- a focused liveness utility and tests under `src/utils/`
- `src/components/BiometricDeviceModule.tsx`
- `src/types.ts`
- `electron/main.cjs`
- `windows-kiosk/main.cjs`
- `windows-kiosk/preload.cjs`
- `windows-kiosk/renderer/app.js`
- `windows-kiosk/renderer/index.html` / `styles.css` as needed
- focused CommonJS tests for privileged challenge validation

Preserve unrelated dirty-worktree changes. Use `apply_patch`. Do not modify Firestore data automatically. Run `npm.cmd test`, any kiosk CommonJS tests, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run kiosk:build` if practical, and scoped `git diff --check`.
