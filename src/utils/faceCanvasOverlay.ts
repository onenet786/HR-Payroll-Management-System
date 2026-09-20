/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TrackedFaceRenderData {
  id: string;
  box: { x: number; y: number; width: number; height: number };
  employeeName?: string;
  employeeCode?: string;
  confidence?: number;
  status: 'matched' | 'cooldown' | 'verifying' | 'unknown';
  statusText: string;
  punchTime?: string;
}

export function drawMultiFaceHUD(
  canvas: HTMLCanvasElement,
  faces: TrackedFaceRenderData[],
  isMirrored = true
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Clear previous frame
  ctx.clearRect(0, 0, width, height);

  if (!faces || faces.length === 0) return;

  const fontSizeSmall = Math.max(10, Math.round(11 * (width / 640)));
  const fontSizeLarge = Math.max(12, Math.round(13 * (width / 640)));

  for (const face of faces) {
    const { box, status, employeeName, employeeCode, statusText } = face;

    // Calculate canvas coordinates
    let rx = box.x * width;
    if (isMirrored) {
      // In mirrored video, x is flipped
      rx = (1 - box.x - box.width) * width;
    }
    const ry = box.y * height;
    const rw = box.width * width;
    const rh = box.height * height;

    // Color definitions based on status
    let primaryColor = '#3b82f6'; // Blue / Verifying
    let glowColor = 'rgba(59, 130, 246, 0.4)';
    let bgPillColor = 'rgba(15, 23, 42, 0.85)';

    if (status === 'matched') {
      primaryColor = '#10b981'; // Emerald Green / Matched & Punched
      glowColor = 'rgba(16, 185, 129, 0.5)';
      bgPillColor = 'rgba(6, 78, 59, 0.9)';
    } else if (status === 'cooldown') {
      primaryColor = '#06b6d4'; // Cyan/Blue / Already recorded
      glowColor = 'rgba(6, 182, 212, 0.35)';
      bgPillColor = 'rgba(8, 51, 68, 0.9)';
    } else if (status === 'unknown') {
      primaryColor = '#94a3b8'; // Slate / Unknown
      glowColor = 'rgba(148, 163, 184, 0.25)';
      bgPillColor = 'rgba(30, 41, 59, 0.85)';
    } else if (status === 'verifying') {
      primaryColor = '#f59e0b'; // Amber / Scanning
      glowColor = 'rgba(245, 158, 11, 0.4)';
      bgPillColor = 'rgba(120, 53, 15, 0.9)';
    }

    ctx.save();

    // 1. Draw outer glowing bounding box
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(rx, ry, rw, rh);

    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    // 2. High-Tech Corner Brackets
    const cornerLen = Math.min(22, Math.min(rw, rh) * 0.25);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = primaryColor;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(rx, ry + cornerLen);
    ctx.lineTo(rx, ry);
    ctx.lineTo(rx + cornerLen, ry);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(rx + rw - cornerLen, ry);
    ctx.lineTo(rx + rw, ry);
    ctx.lineTo(rx + rw, ry + cornerLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh - cornerLen);
    ctx.lineTo(rx, ry + rh);
    ctx.lineTo(rx + cornerLen, ry + rh);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(rx + rw - cornerLen, ry + rh);
    ctx.lineTo(rx + rw, ry + rh);
    ctx.lineTo(rx + rw, ry + rh - cornerLen);
    ctx.stroke();

    // 3. Top Label (Above Box) - Name or Expression Tag (e.g. "neutral" like in user image)
    const topTitle = employeeName || (status === 'unknown' ? 'Unknown' : 'neutral');
    ctx.font = `bold ${fontSizeLarge}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const titleWidth = ctx.measureText(topTitle).width;
    const topPillW = titleWidth + 20;
    const topPillH = fontSizeLarge + 10;
    const topPillX = rx + (rw - topPillW) / 2;
    const topPillY = Math.max(8, ry - topPillH - 6);

    // Pill background
    ctx.fillStyle = bgPillColor;
    ctx.beginPath();
    ctx.roundRect(topPillX, topPillY, topPillW, topPillH, 6);
    ctx.fill();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pill text
    ctx.fillStyle = primaryColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(topTitle, topPillX + topPillW / 2, topPillY + topPillH / 2);

    // 4. Bottom Status Pill (Inside/Below Box)
    const bottomLabel = statusText || (employeeCode ? `ID: ${employeeCode}` : '');
    if (bottomLabel) {
      ctx.font = `600 ${fontSizeSmall}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const bottomW = ctx.measureText(bottomLabel).width;
      const bottomPillW = bottomW + 16;
      const bottomPillH = fontSizeSmall + 8;
      const bottomPillX = rx + (rw - bottomPillW) / 2;
      const bottomPillY = Math.min(height - bottomPillH - 8, ry + rh + 6);

      ctx.fillStyle = bgPillColor;
      ctx.beginPath();
      ctx.roundRect(bottomPillX, bottomPillY, bottomPillW, bottomPillH, 6);
      ctx.fill();
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bottomLabel, bottomPillX + bottomPillW / 2, bottomPillY + bottomPillH / 2);
    }

    ctx.restore();
  }
}
