# GLV Global Food Services LLC

**Miami, Florida · International Food Trade**

Corporate website for GLV Global Food Services LLC — a Miami-based food export company specializing in eggs, grains, coconut oils, tropical fruits, live animals, and international trade operations.

---

## Stack

- HTML5 · CSS3 · Vanilla JavaScript
- PHP (`mail()`) for contact form
- Apache `.htaccess` — clean URLs, security headers, Gzip, browser cache
- Hosted on Hostinger · Deployed via Git

## Pages

| File | Route | Description |
|------|-------|-------------|
| `index.html` | `/` | Home — hero video, product grid, contact form |
| `huevo-proteinas.html` | `/huevo-proteinas` | USDA Eggs & Proteins |
| `coco-aceites.html` | `/coco-aceites` | Coconut & Oils |
| `granos-cereales.html` | `/granos-cereales` | Grains & Cereals |
| `frutas.html` | `/frutas` | Tropical Fruits |
| `animales-vivos.html` | `/animales-vivos` | Live Animals & Cuts |
| `comercio-internacional.html` | `/comercio-internacional` | International Trade |

## Repository Structure

```
glvglobalfoodservices/
├── .gitignore
├── .htaccess           # Apache — clean URLs, security, cache
├── README.md
├── index.html
├── [page].html         # One file per product line
├── styles.css
├── app.js
├── send-email.php      # Contact form — uses server mail()
└── imagenes/           # Static assets (JPG/WebP)
```

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — Hostinger Git Deployment listens here |
| `develop` | Integration / staging |
| `feature/*` | New features |
| `hotfix/*` | Urgent production fixes |

## Deployment

Hostinger Git Deployment auto-pulls `main` into `public_html/` on every push.

Videos are served directly from Hostinger File Manager (not tracked in Git).

## Contact Form

`send-email.php` uses PHP's native `mail()` — no SMTP credentials in code.  
Sends to `info@glvglobalfoodservices.com` and `info@glvservicesexp.com`.  
Auto-reply sent to the customer upon successful submission.

---

*Where Food Moves Markets.*
