# PAWA Translate (backend seguro)

Proxy en Cloudflare Worker: **DeepL** (recomendado) o **Gemini**. Las claves **no** van en el navegador.

## Despliegue (una vez)

1. Cuenta en [Cloudflare](https://dash.cloudflare.com/) (gratis).
2. Instala Wrangler y despliega:

```bash
cd cloud-translate
npm install
npx wrangler login
npx wrangler secret put DEEPL_AUTH_KEY   # clave DeepL (termina en :fx si es gratis)
# opcional respaldo:
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

3. Copia la URL que muestra Wrangler, por ejemplo:  
   `https://pawa-translate.TU-SUBDOMINIO.workers.dev`

4. En la app PAWA → **Calidad de traducción** → **Nube (DeepL)** → pega esa URL.

## DeepL gratis

Registro: https://www.deepl.com/pro-api  
Plan free: `api-free.deepl.com`, clave con sufijo `:fx`.
