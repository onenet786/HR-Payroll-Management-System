// Employee photos as their own, cacheable URLs instead of inside every employee record.
//
// Imported and uploaded photos are stored in the employee document as data URLs (a few KB each). Sending them with
// every employee list made the list 2-5x larger (4 MB of 5 MB after a CyberAP import). The collection API now
// replaces a data URL with a signed link to this route; the browser loads a photo only when it shows it and caches
// it (the link changes when the photo changes, so a year-long cache is safe). The link is signed with a server key,
// so only users who received it from an authorised employee list can open it; no session is needed, which lets an
// <img> tag load it (also from the mobile app on another origin).
const crypto = require('node:crypto');
const express = require('express');
const { pool } = require('./db.cjs');

const ROUTE = '/api/employee-photos/';
const key = crypto.createHash('sha256').update(`employee-photo:${process.env.PHOTO_URL_SECRET || process.env.SESSION_SECRET || process.env.DATABASE_URL || 'local'}`).digest();
const versionOf = dataUrl => crypto.createHash('sha1').update(dataUrl).digest('base64url').slice(0, 12);
const signatureOf = (id, version) => crypto.createHmac('sha256', key).update(`${id}.${version}`).digest('base64url').slice(0, 22);

/** The link that stands in for an inline photo in employee lists. */
function photoUrlFor(id, dataUrl) {
  const version = versionOf(dataUrl);
  return `${ROUTE}${encodeURIComponent(id)}?v=${version}&s=${signatureOf(id, version)}`;
}

const isPhotoLink = value => typeof value === 'string' && value.includes(ROUTE);

/** Employee list rows: inline photos become links (the stored record is unchanged). */
function withPhotoLinks(rows) {
  return rows.map(row => {
    const picture = row.data?.pictureUrl;
    if (typeof picture !== 'string' || !picture.startsWith('data:')) return row;
    return { ...row, data: { ...row.data, pictureUrl: photoUrlFor(row.document_id, picture) } };
  });
}

/** When a browser saves an employee it sends the link back: keep the stored photo instead. */
function keepStoredPhoto(body, existing) {
  if (body && isPhotoLink(body.pictureUrl)) body.pictureUrl = existing?.pictureUrl || '';
  return body;
}

const router = express.Router();
router.get('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '');
    const version = String(req.query.v || '');
    const signature = String(req.query.s || '');
    const expected = signatureOf(id, version);
    if (!version || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(403).end();
    const picture = (await pool.query(`SELECT data->>'pictureUrl' AS picture FROM employees WHERE id=$1`, [id])).rows[0]?.picture;
    const match = typeof picture === 'string' ? picture.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s) : null;
    if (!match) return res.status(404).end();
    res.setHeader('Content-Type', match[1]);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // The link carries the photo's version: the same link always means the same picture.
    res.setHeader('Cache-Control', versionOf(picture) === version ? 'private, max-age=31536000, immutable' : 'private, no-cache');
    res.send(Buffer.from(match[2], 'base64'));
  } catch (error) { next(error); }
});

module.exports = { router, photoUrlFor, withPhotoLinks, keepStoredPhoto, isPhotoLink };
