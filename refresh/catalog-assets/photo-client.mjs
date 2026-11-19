import {galleryPhotoUrl} from './photo-gallery.mjs?v=gallery-1119';
export const PHOTO_PORTAL = 'https://karatnik-product-photos.workspace-903713.chatgpt.site';
const MANIFEST_URL = `${PHOTO_PORTAL}/api/public/photos`;
const APPROVED_IMAGE = /^https:\/\/karatnik-product-photos\.workspace-903713\.chatgpt\.site\/api\/images\/[0-9a-f-]{36}$/i;
export const isApprovedPhotoUrl = value => typeof value==='string' && APPROVED_IMAGE.test(value);
export const hasProductPhoto = item => /^photos\/[^/\\]+\.webp$/i.test(item?.photo||'') && !(item.photo||'').includes('..') || (item?.photoSource==='approved' && !!galleryPhotoUrl(item.photo));

export function photoPair(art, brand) {
  return `${String(art || '').trim()}|${String(brand || '').trim().toLocaleLowerCase('ru')}`;
}

export async function photoUploadUrl(art, brand) {
  const key = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(photoPair(art, brand)));
  const hex = [...new Uint8Array(key)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${PHOTO_PORTAL}/?product=${encodeURIComponent(hex)}`;
}

export async function loadApprovedPhotos() {
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store', mode: 'cors', signal: AbortSignal.timeout(4000) });
    if (!response.ok) return new Map();
    const manifest = await response.json();
    const photos = new Map();
    for (const item of manifest.items || []) {
      if (!item || typeof item.art !== 'string' || typeof item.brand !== 'string' || typeof item.url !== 'string') continue;
      if (!galleryPhotoUrl(item.url)) continue;
      const gallery=Array.isArray(item.photos)?item.photos.filter(p=>p&&galleryPhotoUrl(p.url)):[];
      photos.set(photoPair(item.art, item.brand), {...item,photos:gallery});
    }
    return photos;
  } catch {
    return new Map();
  }
}

export function appendPhotoUploadLink(container, art, brand) {
  const link = document.createElement('a');
  link.className = 'add-photo-link';
  link.href = PHOTO_PORTAL;
  link.textContent = 'Добавить фото';
  link.setAttribute('aria-label', `Добавить фото: ${art}`);
  link.addEventListener('click', async event => {
    event.preventDefault();
    try { location.assign(await photoUploadUrl(art, brand)); }
    catch { location.assign(PHOTO_PORTAL); }
  });
  container.append(link);
  return link;
}
