import { detectFaceGeometry } from './faceLandmarker';

export type LivenessDirection = 'left' | 'right';

export interface LivenessObservation {
  at: number;
  yaw: number;
  centerX: number;
  centerY: number;
  scale: number;
}

export interface LivenessSummary {
  order: [LivenessDirection, LivenessDirection];
  frameCounts: [number, number, number, number, number];
  durationMs: number;
  maxLeftYaw: number;
  maxRightYaw: number;
  maxCenterDrift: number;
  maxScaleChange: number;
}

export interface LivenessResult {
  ok: boolean;
  message: string;
  summary?: LivenessSummary;
}

export const LIVENESS_METHOD = 'active-turn-v1' as const;
export const LIVENESS_MIN_FRAMES = 3;
export const LIVENESS_MAX_DURATION_MS = 25_000;
export const LIVENESS_MAX_CENTER_DRIFT = 0.15;

export function isValidLivenessAttestation(value: unknown): boolean {
  const attestation = value as any;
  const summary = attestation?.summary;
  const order = summary?.order;
  const counts = summary?.frameCounts;
  const verifiedAt = Date.parse(attestation?.verifiedAt || '');
  if (attestation?.method !== LIVENESS_METHOD || !Number.isFinite(verifiedAt) || verifiedAt > Date.now() + 300_000) return false;
  if (!Array.isArray(order) || order.length !== 2 || !order.every((item: unknown) => item === 'left' || item === 'right') || order[0] === order[1]) return false;
  if (!Array.isArray(counts) || counts.length !== 5 || !counts.every((count: unknown) => Number.isInteger(count) && Number(count) >= LIVENESS_MIN_FRAMES && Number(count) <= 80)) return false;
  if (!Number.isFinite(summary.durationMs) || summary.durationMs <= 0 || summary.durationMs > LIVENESS_MAX_DURATION_MS) return false;
  if (!Number.isFinite(summary.maxLeftYaw) || summary.maxLeftYaw < 0.27 || summary.maxLeftYaw > 2) return false;
  if (!Number.isFinite(summary.maxRightYaw) || summary.maxRightYaw < 0.27 || summary.maxRightYaw > 2) return false;
  if (!Number.isFinite(summary.maxCenterDrift) || summary.maxCenterDrift < 0 || summary.maxCenterDrift > LIVENESS_MAX_CENTER_DRIFT) return false;
  if (!Number.isFinite(summary.maxScaleChange) || summary.maxScaleChange < 0 || summary.maxScaleChange > 0.22) return false;
  return true;
}

const phaseTarget = (phase: number, order: [LivenessDirection, LivenessDirection]) =>
  phase === 1 ? order[0] : phase === 3 ? order[1] : 'center';

export function validateLivenessSequence(
  observations: LivenessObservation[],
  order: [LivenessDirection, LivenessDirection],
  maxDurationMs = LIVENESS_MAX_DURATION_MS,
): LivenessResult {
  if (observations.length < LIVENESS_MIN_FRAMES * 5) {
    return { ok: false, message: 'Not enough live face frames were captured.' };
  }
  const durationMs = observations.at(-1)!.at - observations[0].at;
  if (durationMs <= 0 || durationMs > maxDurationMs) {
    return { ok: false, message: 'Active liveness challenge expired. Start again.' };
  }

  const origin = observations.slice(0, LIVENESS_MIN_FRAMES);
  const baseX = origin.reduce((sum, item) => sum + item.centerX, 0) / origin.length;
  const baseY = origin.reduce((sum, item) => sum + item.centerY, 0) / origin.length;
  const baseScale = origin.reduce((sum, item) => sum + item.scale, 0) / origin.length;
  if (!Number.isFinite(baseScale) || baseScale <= 0) return { ok: false, message: 'Invalid face geometry.' };

  let maxCenterDrift = 0;
  let maxScaleChange = 0;
  let maxLeftYaw = 0;
  let maxRightYaw = 0;
  for (const item of observations) {
    if (![item.at, item.yaw, item.centerX, item.centerY, item.scale].every(Number.isFinite)) {
      return { ok: false, message: 'Invalid liveness observation.' };
    }
    maxCenterDrift = Math.max(maxCenterDrift, Math.hypot(item.centerX - baseX, item.centerY - baseY));
    maxScaleChange = Math.max(maxScaleChange, Math.abs(item.scale / baseScale - 1));
    maxLeftYaw = Math.max(maxLeftYaw, item.yaw);
    maxRightYaw = Math.max(maxRightYaw, -item.yaw);
  }
  if (maxCenterDrift > LIVENESS_MAX_CENTER_DRIFT) {
    return { ok: false, message: 'The phone or face moved too far during verification. Hold the phone steady and turn only your head.' };
  }
  if (maxScaleChange > 0.22) {
    return { ok: false, message: 'Face size changed too much. Keep the same distance from the camera.' };
  }

  const matches = (target: LivenessDirection | 'center', yaw: number) =>
    target === 'center' ? Math.abs(yaw) <= 0.18 : target === 'left' ? yaw >= 0.27 : yaw <= -0.27;
  const frameCounts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let phase = 0;
  for (const item of observations) {
    const target = phaseTarget(phase, order);
    if (matches(target, item.yaw)) {
      frameCounts[phase] += 1;
      if (frameCounts[phase] >= LIVENESS_MIN_FRAMES && phase < 4) phase += 1;
    } else if (frameCounts[phase] < LIVENESS_MIN_FRAMES) {
      frameCounts[phase] = 0;
    }
  }
  if (phase !== 4 || frameCounts[4] < LIVENESS_MIN_FRAMES) {
    return { ok: false, message: 'Required head-turn sequence was not completed. Do not move the camera or use a photograph.' };
  }

  return {
    ok: true,
    message: 'Active liveness verified.',
    summary: { order, frameCounts, durationMs, maxLeftYaw, maxRightYaw, maxCenterDrift, maxScaleChange },
  };
}

export function randomLivenessOrder(random = Math.random): [LivenessDirection, LivenessDirection] {
  return random() < 0.5 ? ['left', 'right'] : ['right', 'left'];
}

export async function observeFaceLiveness(video: HTMLVideoElement): Promise<LivenessObservation> {
  const faces = await detectFaceGeometry(video);
  if (faces.length !== 1) throw new Error('Keep exactly one face inside the oval.');
  const face = faces[0];
  return {
    at: Date.now(), yaw: face.yaw, centerX: face.centerX, centerY: face.centerY, scale: face.width,
  };
}

export async function performActiveLiveness(
  video: HTMLVideoElement,
  order: [LivenessDirection, LivenessDirection],
  onStatus?: (message: string, phase: number) => void,
): Promise<LivenessResult> {
  const labels = [
    'Center your face inside the oval',
    order[0] === 'left' ? 'Turn your head LEFT' : 'Turn your head RIGHT',
    'Return to center',
    order[1] === 'left' ? 'Turn your head LEFT' : 'Turn your head RIGHT',
    'Return to center',
  ];
  const observations: LivenessObservation[] = [];
  const start = Date.now();
  let phase = 0;
  let consecutive = 0;
  let lastPhase = -1;
  const matches = (target: LivenessDirection | 'center', yaw: number) =>
    target === 'center' ? Math.abs(yaw) <= 0.18 : target === 'left' ? yaw >= 0.27 : yaw <= -0.27;
  while (Date.now() - start <= LIVENESS_MAX_DURATION_MS) {
    if (phase !== lastPhase) { onStatus?.(labels[phase], phase); lastPhase = phase; }
    let observation: LivenessObservation | null = null;
    try {
      observation = await observeFaceLiveness(video);
    } catch {
      consecutive = 0;
      await new Promise(resolve => setTimeout(resolve, 110));
      continue;
    }
    observations.push(observation);
    const target = phaseTarget(phase, order);
    consecutive = matches(target, observation.yaw) ? consecutive + 1 : 0;
    if (consecutive >= LIVENESS_MIN_FRAMES) {
      if (phase === 4) {
        const result = validateLivenessSequence(observations, order);
        if (result.ok) { onStatus?.('Live person verified', 5); return result; }
        return result;
      }
      phase += 1;
      consecutive = 0;
    }
    await new Promise(resolve => setTimeout(resolve, 110));
  }
  return { ok: false, message: 'Active liveness challenge expired. Start again.' };
}
