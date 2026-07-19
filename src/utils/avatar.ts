const MALE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">',
  '<rect width="40" height="40" fill="#1e40af"/>',
  '<circle cx="20" cy="14" r="9" fill="#bfdbfe"/>',
  '<path d="M4 40 Q4 24 20 24 Q36 24 36 40Z" fill="#bfdbfe"/>',
  '</svg>',
].join('');

const FEMALE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">',
  '<rect width="40" height="40" fill="#86198f"/>',
  '<circle cx="20" cy="14" r="9" fill="#f5d0fe"/>',
  '<path d="M4 40 Q4 24 20 24 Q36 24 36 40Z" fill="#f5d0fe"/>',
  '<path d="M11 7 Q20 1 29 7" stroke="#f5d0fe" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
  '</svg>',
].join('');

export const MALE_AVATAR_URL = `data:image/svg+xml;base64,${btoa(MALE_SVG)}`;
export const FEMALE_AVATAR_URL = `data:image/svg+xml;base64,${btoa(FEMALE_SVG)}`;

export function empAvatarUrl(emp: { pictureUrl?: string; gender?: string } | null | undefined): string {
  // Do not load arbitrary third-party URLs: they disclose the viewer's IP/device metadata.
  if (emp?.pictureUrl?.startsWith('data:image/') || emp?.pictureUrl?.startsWith('blob:')) return emp.pictureUrl;
  return emp?.gender?.toLowerCase().startsWith('f') ? FEMALE_AVATAR_URL : MALE_AVATAR_URL;
}
