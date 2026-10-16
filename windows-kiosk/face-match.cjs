// Face identity matching for 128-number face embeddings (face-api / dlib ResNet). Distances are Euclidean:
// the same person is typically below ~0.40, different people above ~0.55.
const FACE_DESCRIPTOR_VERSION = 4;
const FACE_DESCRIPTOR_LENGTH = 128;
const FACE_IDENTIFY_THRESHOLD = 0.45; // no employee code: search everyone
const FACE_VERIFY_THRESHOLD = 0.5; // employee code typed: confirm one person
const FACE_MATCH_MARGIN = 0.06; // runner-up employee must be at least this much further away
const FACE_STRONG_DISTANCE = 0.25; // at or below this a match counts as 100% strength

function normalizeFaceDescriptor(value) {
  if (!value || typeof value !== 'object' || Number(value.version) !== FACE_DESCRIPTOR_VERSION) return null;
  if (!Array.isArray(value.vector) || value.vector.length !== FACE_DESCRIPTOR_LENGTH) return null;
  const vector = value.vector.map(Number);
  if (!vector.every(Number.isFinite)) return null;
  return { version: FACE_DESCRIPTOR_VERSION, vector, capturedAt: value.capturedAt || '', source: value.source || '', liveness: value.liveness };
}

function faceDistance(a, b) {
  if (!a?.vector || !b?.vector || a.vector.length !== b.vector.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.vector.length; i += 1) {
    const delta = a.vector[i] - b.vector[i];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

/**
 * Finds the employee whose enrolled faces are closest to the probe.
 * Rejects when nobody is close enough, when two employees are too close to call, or when the best match is
 * an employee already identified on another face in the same camera frame.
 */
function identifyFace(employees, probe, { threshold = FACE_IDENTIFY_THRESHOLD, margin = FACE_MATCH_MARGIN, excludeEmployeeIds = [], getDescriptors }) {
  const normalizedProbe = normalizeFaceDescriptor(probe);
  if (!normalizedProbe) return { ok: false, message: 'Face could not be read. Look at the camera and try again.' };
  const scored = [];
  for (const employee of employees || []) {
    let best = Number.POSITIVE_INFINITY;
    for (const descriptor of getDescriptors(employee)) best = Math.min(best, faceDistance(normalizedProbe, descriptor));
    if (Number.isFinite(best)) scored.push({ employee, score: best });
  }
  scored.sort((a, b) => a.score - b.score);
  if (!scored.length) return { ok: false, message: 'No enrolled faces to compare. Enroll faces in the HR portal.' };
  const [best, second] = scored;
  if (best.score > threshold) {
    return { ok: false, score: best.score, message: 'Face not recognized. Face the camera in good light, or enter your employee code.' };
  }
  if (second && second.score - best.score < margin) {
    return { ok: false, ambiguous: true, score: best.score, message: 'Face matches more than one employee. Enter your employee code.' };
  }
  if (excludeEmployeeIds.map(String).includes(String(best.employee.id))) {
    return { ok: false, duplicate: true, score: best.score, message: 'This face matched someone already identified in view. Step forward one at a time.' };
  }
  return { ok: true, employee: best.employee, score: best.score, margin: second ? second.score - best.score : null };
}

module.exports = {
  FACE_DESCRIPTOR_VERSION, FACE_DESCRIPTOR_LENGTH, FACE_IDENTIFY_THRESHOLD, FACE_VERIFY_THRESHOLD, FACE_MATCH_MARGIN, FACE_STRONG_DISTANCE,
  normalizeFaceDescriptor, faceDistance, identifyFace,
};
