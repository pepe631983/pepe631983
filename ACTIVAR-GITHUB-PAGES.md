# Arreglar el 404 de PAWA en GitHub Pages

Si ves **“404 — There isn't a GitHub Pages site here”** en  
https://pepe631983.github.io/pepe631983/  
el sitio **ya está compilado** en la rama `gh-pages`, pero **falta activar Pages** en GitHub (solo una vez).

## Pasos (2 minutos)

1. Entra con tu cuenta **pepe631983** (dueña del repo).
2. Abre: **https://github.com/pepe631983/pepe631983/settings/pages**
3. En **Build and deployment** → **Source**, elige **Deploy from a branch**.
4. **Branch:** `gh-pages` · **Folder:** `/ (root)` → **Save**.
5. Espera **1–3 minutos** y recarga:  
   **https://pepe631983.github.io/pepe631983/**

Deberías ver la pantalla de **PAWA** (fondo oscuro, botón *Iniciar traducción*).

### Alternativa: GitHub Actions

En la misma pantalla de Pages, elige **Source: GitHub Actions**.  
Luego en **Actions** → workflow **Deploy PAWA (GitHub Pages)** → **Run workflow**.

---

## Instalar la app

- **Chrome / Edge:** menú → **Instalar app** o banner **Instalar PAWA**.
- **iPhone:** Safari → Compartir → **Añadir a pantalla de inicio**.

---

## Plan B: Firebase Hosting (URL `.web.app`)

Si prefieres no usar GitHub Pages:

```bash
cd voice-translator
npm run build:root
cd ..
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only hosting
```

La URL será del tipo `https://TU-PROYECTO.web.app`.
