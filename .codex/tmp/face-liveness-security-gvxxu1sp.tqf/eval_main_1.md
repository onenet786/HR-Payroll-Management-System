# Evaluation — Attempt 1

## Overall Verdict: MAJOR REVISION

## Overall Assessment

The kiosk preserves the established dark blue/emerald console well, and the new five-state rail makes the intended live action much more visible on desktop. The implementation is not ready to ship as a security control, however: stored v3 attestations can be accepted without a complete valid challenge summary, and the privileged challenge boundary does not fully meet the stipulated consumption and bounded-proof rules. The kiosk also visibly overflows at tablet and phone widths, contrary to the responsive requirement.

Runtime limitation: the HR app opens to its authenticated sign-in screen in this environment, and no camera/FaceDetector-capable Electron runtime or authenticated Firestore data was available. I inspected the HR source and exercised the unauthenticated kiosk renderer from its local HTML at 1440px, 768px, and 375px. Desktop, tablet, and mobile screenshots are retained beside this report.

## Scores

| Criterion | Score | Status | Weight | Notes |
|-----------|-------|--------|--------|-------|
| Design Quality | 2/3 | PASS | HIGH | The desktop kiosk rail is a coherent extension of the existing blue/emerald console: amber identifies the current action, emerald completion, and rose failure. |
| Originality | 2/3 | PASS | HIGH | The compact security rail is a purposeful, product-specific treatment rather than a decorative redesign, appropriate to the brief. |
| Craft | 0/3 | FAIL | MEDIUM | At 768px the top bar truncates and the layout begins to overflow; at 375px the desktop canvas is horizontally clipped, including the keypad, button, camera rail, and header. This is a fundamental responsive failure. |
| Functionality | 1/3 | PASS | MEDIUM | Desktop guidance is understandable and the source fails closed when FaceDetector/landmarks are unavailable, but the tablet/mobile clipping and misleading code placeholder introduce real operating friction. |

## What's Working Well

- The kiosk main process issues one-time, cryptographically random challenge IDs and randomized turn order, with expiry and failure lockout in `windows-kiosk/liveness.cjs`.
- The renderer’s yaw is derived from nose displacement relative to eye geometry rather than box movement, and the validator checks center drift, scale change, phase order, and consecutive frames. This directly addresses the photographed-face and moving-flat-screen cases in the stated threat model.
- Legacy v1/v2 descriptors are excluded by both HR-side recognition and kiosk-side normalization. Secure enrollment replaces, rather than appends to, older descriptors.
- The desktop camera view presents the action prominently above a compact, readable five-step rail. Capability, IP-camera, legacy-enrollment, and liveness failure messages are specific rather than generic.
- `npm.cmd test` (35 tests), `node --test windows-kiosk/liveness.test.cjs` (5 tests), `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check` all completed successfully. The production build reports only the pre-existing large-JS-chunk warning.

## Issues Found

### Issue 1: A forged/incomplete v3 attestation is treated as secure

- **What**: Both `src/utils/faceRecognition.ts:59-69` and `windows-kiosk/main.cjs:773-785` accept any array whose elements meet the minimum count. JavaScript’s `[].every(...)` is true, so a v3 descriptor with `frameCounts: []` passes. They also do not validate that there are exactly five frame counts, the order is opposite left/right directions, duration is positive and bounded, or the stored geometry/yaw summary is plausible and within the protocol limits.
- **Where**: `getFaceDescriptors` and kiosk `normalizeFaceDescriptor`.
- **Why it matters**: This defeats the requirement that authentication use only v3 descriptors with a *valid* active-liveness attestation. A persisted metadata claim can be made to look secure without proving the five-phase protocol completed.
- **Suggested fix**: Centralize a runtime `isValidLivenessAttestation` predicate and use it in both paths. Require exactly five integer counts at/above the minimum, an exact opposite-direction pair, finite bounded duration and metrics, required maxima consistent with the successful sequence, and a valid timestamp. Add negative tests for empty/short/long counts, repeated/invalid order, invalid duration, and out-of-range summaries.

### Issue 2: The privileged camera boundary accepts unbounded proof payloads and does not consume a pending challenge on every attempt

- **What**: `validateAndConsume` accepts an unbounded renderer-provided `observations` array. The renderer sends full per-frame observations rather than a bounded proof. Separately, `kiosk:punch-camera` returns for a missing code or IP-camera condition before it calls `validateAndConsume` (`windows-kiosk/main.cjs:1207-1217`), leaving an already-issued challenge usable until expiry.
- **Where**: `windows-kiosk/liveness.cjs` and the `kiosk:punch-camera` handler.
- **Why it matters**: The brief explicitly requires bounded observation summaries/proof and consumption on any punch verification attempt. An arbitrary-size payload is a main-process denial-of-service surface, while a preserved challenge violates the intended one-attempt replay boundary.
- **Suggested fix**: Put a strict maximum on proof observations (derived from 25 seconds / sample interval with a small margin), reject before iterating, and define a compact allowed shape. Invalidate the terminal’s outstanding challenge on every camera-punch invocation (including precondition failures) or bind it to a narrowly scoped request and consume it before returning any verification result. Cover these handler-level cases with tests.

### Issue 3: Kiosk layout is not usable at tablet and phone widths

- **What**: At 768px, the brand wraps/truncates and the layout is already wider than the viewport. At 375px, the page retains a desktop-width three-column canvas; most header controls, keypad/button content, and the new challenge rail are cut off to the right instead of reflowing or scrolling intentionally.
- **Where**: `windows-kiosk/renderer/styles.css`, including the workspace and top-bar layouts; reproduced in `kiosk-camera-tablet.png` and `kiosk-camera-mobile.png`.
- **Why it matters**: The brief specifically requires the rail to fit at phone/tablet/desktop widths. Clipped instructions are especially dangerous when users must follow a randomized security sequence at a kiosk.
- **Suggested fix**: Add responsive breakpoints that collapse the workspace to one column, allow/wrap or simplify the top bar, make the camera/rail width `100%`, and preserve a minimum accessible target size for all five steps. Re-test at 375px, 768px, and 1440px with the camera state active.

### Issue 4: The code field contradicts the full-code security requirement

- **What**: The kiosk field placeholder says `IND-KHI-001 or suffix 001`, while the camera flow and main process require the full employee code and exact-match lookup.
- **Where**: `windows-kiosk/renderer/index.html:118`.
- **Why it matters**: A user follows the visible instruction, then receives an avoidable failure at the most security-sensitive step. It weakens the otherwise clear full-code policy.
- **Suggested fix**: Change the placeholder and nearby camera instruction to an unambiguous full-code example only; ensure lookup/help text uses the same wording.

### Issue 5: Tests do not cover the actual main-process camera handler contract

- **What**: The new CommonJS tests exercise `createChallengeManager`, but not `kiosk:punch-camera` itself. There is no automated proof that the IPC handler rejects missing code, IP camera, insecure enrollment, or invalid challenge before `savePunch`/comparison.
- **Where**: `windows-kiosk/liveness.test.cjs` versus `windows-kiosk/main.cjs:1204-1275`.
- **Why it matters**: The brief explicitly requests handler-level tests for these security gates; unit tests of the helper cannot detect a future reordering or bypass in the handler.
- **Suggested fix**: Extract the handler’s decision logic behind injected dependencies (store lookup, challenge manager, comparator, `savePunch`) and add focused tests for each stated rejection and for the no-compare/no-save invariant.

## Priority Fixes for Next Attempt

1. Fail closed on complete, runtime-validated v3 liveness attestations in both HR and kiosk recognition; add the missing adversarial descriptor tests.
2. Bound and consume privileged challenge proofs at the IPC boundary, then add handler-level tests proving no failure path can continue to face matching or save a punch.
3. Implement and visually verify responsive kiosk/rail layouts at 375px and 768px; also correct the full-code placeholder.

## Should the next attempt REFINE or PIVOT?

REFINE. The desktop design direction and core active-turn approach are sound. The next iteration needs rigorous security hardening at the data/IPC boundary and responsive implementation work, not a different visual concept.
