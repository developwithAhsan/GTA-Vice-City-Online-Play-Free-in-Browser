---
name: Blog SEO Build
description: 22 blog posts written in public/blog/ with shared CSS, sitemap, robots.txt and index.html updated.
---

# Blog SEO Build

**Why:** Major SEO push — 22 articles to capture GTA Vice City search traffic.

## Structure
- All posts live in `public/blog/`
- Shared stylesheet: `/blog/blog.css` — imported by every post
- Canonical tag pattern: `<script>var l=document.createElement('link');l.rel='canonical';l.href=location.origin+'/blog/POST.html';document.head.appendChild(l);</script>`
- Every post has: Article schema, og:tags, twitter:card, TOC (where appropriate), related posts grid, CTA block
- Blog index at `/blog/index.html` — 22 article cards with Blog + BreadcrumbList schema

## Posts written (all in public/blog/)
gta-vice-city-cheat-codes.html, play-gta-vice-city-browser.html, gta-vice-city-missions-list.html, gta-vice-city-hidden-packages.html, best-cars-gta-vice-city.html, gta-vice-city-map-guide.html, gta-vice-city-weapons-guide.html, gta-vice-city-properties.html, gta-vice-city-radio-stations.html, gta-vice-city-easter-eggs.html, gta-vice-city-100-percent.html, gta-vice-city-unique-stunt-jumps.html, gta-vice-city-rampages.html, gta-vice-city-motorcycles.html, gta-vice-city-vs-san-andreas.html, tommy-vercetti-story.html, gta-vice-city-tips-beginners.html, gta-vice-city-story-explained.html, gta-vice-city-side-missions.html, gta-vice-city-review-2024.html, gta-vice-city-wasm-technology.html, gta-vice-city-wanted-level-guide.html

## SEO files updated
- `public/sitemap.xml` — all 22 blog URLs + main pages, relative paths
- `public/robots.txt` — blocks /vcbr/, /vcsky/, points to /sitemap.xml
- `index.html` — canonical JS tag added in <head>, "Guides & Articles" section added in content with 6 blog links

## How to apply
When adding new blog posts: (1) create the HTML in public/blog/, (2) add to blog/index.html grid, (3) add to sitemap.xml.
