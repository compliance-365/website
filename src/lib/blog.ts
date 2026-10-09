// One place to read and format blog posts, shared by the post page, the
// blog index, the header's "latest" menu, the 404 page and the OG images.
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** All posts, newest first. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog');
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Australian long date, e.g. "25 January 2026". Front-matter dates are
 *  calendar dates (parsed as UTC midnight), so format in UTC: otherwise a
 *  build machine west of Greenwich shows the day before. */
export function formatPostDate(d: Date | undefined): string {
  if (!d) return '';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Cover image as a site-relative URL (or the absolute URL as given). */
export function coverUrl(img: string | undefined, base = import.meta.env.BASE_URL || '/'): string | null {
  if (!img) return null;
  if (/^https?:\/\//i.test(img)) return img;
  return `${base}${String(img).replace(/^\/+/, '')}`;
}
