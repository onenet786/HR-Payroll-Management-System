/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Employee } from '../types';
import { detectFaceGeometry, DetectedFaceGeometry } from './faceLandmarker';
import { createFaceDescriptorFromVideo, findBestFaceMatch, FACE_MATCH_THRESHOLD } from './faceRecognition';
import { TrackedFaceRenderData } from './faceCanvasOverlay';

export interface MultiFaceTrackSession {
  cooldownUntil: number;
  stableFrames: number;
  lastSeenAt: number;
  lastPunchedAt?: string;
}

export class MultiFaceTracker {
  private employeeSessions = new Map<string, MultiFaceTrackSession>();
  private cooldownDurationMs: number;

  constructor(cooldownMinutes = 5) {
    this.cooldownDurationMs = cooldownMinutes * 60 * 1000;
  }

  public clearCooldown(employeeId?: string): void {
    if (employeeId) {
      this.employeeSessions.delete(employeeId);
    } else {
      this.employeeSessions.clear();
    }
  }

  public async processFrame(
    video: HTMLVideoElement,
    enrolledEmployees: Employee[],
    onTriggerPunch?: (employee: Employee) => void | Promise<void>
  ): Promise<TrackedFaceRenderData[]> {
    if (!video.videoWidth || !video.videoHeight) return [];

    let detectedFaces: DetectedFaceGeometry[] = [];
    try {
      detectedFaces = await detectFaceGeometry(video);
    } catch {
      return [];
    }

    if (detectedFaces.length === 0) {
      return [];
    }

    const now = Date.now();
    const renderList: TrackedFaceRenderData[] = [];

    for (let index = 0; index < detectedFaces.length; index++) {
      const face = detectedFaces[index];
      const box = face.box;

      // Extract descriptor cropped specifically to this face
      let matchedEmployee: Employee | null = null;
      let matchScore = 1;

      try {
        const probe = createFaceDescriptorFromVideo(video, `multi-face-${index}`, box);
        const match = findBestFaceMatch(enrolledEmployees, probe, FACE_MATCH_THRESHOLD);
        if (match) {
          matchedEmployee = match.employee;
          matchScore = match.score;
        }
      } catch (err) {
        // Fall back to unknown
      }

      const faceId = `face-${index}`;

      if (matchedEmployee) {
        const empId = matchedEmployee.id;
        let session = this.employeeSessions.get(empId);
        if (!session) {
          session = {
            cooldownUntil: 0,
            stableFrames: 0,
            lastSeenAt: now,
          };
          this.employeeSessions.set(empId, session);
        }

        session.lastSeenAt = now;
        const isCoolingDown = now < session.cooldownUntil;

        if (isCoolingDown) {
          renderList.push({
            id: faceId,
            box,
            employeeName: matchedEmployee.fullName,
            employeeCode: matchedEmployee.employeeCode,
            status: 'cooldown',
            statusText: session.lastPunchedAt ? `Punched ${session.lastPunchedAt}` : 'Already Recorded',
          });
        } else {
          session.stableFrames += 1;

          if (session.stableFrames >= 3) {
            // Trigger automatic attendance punch
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            session.lastPunchedAt = timeStr;
            session.cooldownUntil = now + this.cooldownDurationMs;
            session.stableFrames = 0;

            if (onTriggerPunch) {
              void onTriggerPunch(matchedEmployee);
            }

            renderList.push({
              id: faceId,
              box,
              employeeName: matchedEmployee.fullName,
              employeeCode: matchedEmployee.employeeCode,
              status: 'matched',
              statusText: `PUNCHED IN · ${timeStr}`,
              punchTime: timeStr,
            });
          } else {
            renderList.push({
              id: faceId,
              box,
              employeeName: matchedEmployee.fullName,
              employeeCode: matchedEmployee.employeeCode,
              status: 'verifying',
              statusText: `Verifying... (${session.stableFrames}/3)`,
            });
          }
        }
      } else {
        renderList.push({
          id: faceId,
          box,
          employeeName: 'Unknown Person',
          status: 'unknown',
          statusText: 'No Profile Match',
        });
      }
    }

    return renderList;
  }
}
