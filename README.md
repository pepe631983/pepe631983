# Video Sin Anuncios

Herramientas para **ver videos** y **cerrar o saltar anuncios automáticamente**, sin tener que pulsar «Saltar» o la X en cada anuncio.

## Qué incluye

| Componente | Para qué sirve |
|------------|----------------|
| **Extensión de navegador** (`extension/`) | YouTube, Twitch, Facebook, Instagram, TikTok, Dailymotion, Vimeo: pulsa «Saltar», cierra overlays y (opcional) acelera anuncios en YouTube. |
| **Reproductor web** (`web/`) | Reproduce enlaces **directos** a `.mp4`, `.webm`, etc., sin anuncios de por medio. |

> **Nota:** Los sitios como YouTube no permiten incrustar su reproductor en otra página con control total; por eso la extensión actúa **dentro** de la pestaña donde ya ves el video.

## Instalar la extensión (Chrome, Edge, Brave)

1. Abre `chrome://extensions` (o `edge://extensions`).
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** / **Load unpacked**.
4. Elige la carpeta `extension` de este repositorio.
5. Abre YouTube (u otro sitio soportado) y reproduce un video; la extensión trabajará en segundo plano.

### Opciones

Haz clic en el icono de la extensión:

- **Activado** — interruptor general.
- **Pulsar «Saltar» automáticamente** — hace clic en botones de omitir anuncio.
- **Ocultar banners superpuestos** — oculta capas de anuncio visuales.
- **Acelerar anuncios (YouTube)** — sube la velocidad de reproducción durante el anuncio para que pase antes (cuando no hay botón de saltar).

## Usar el reproductor web

Sirve para URLs de archivo de video, no para páginas de YouTube.

```bash
# Desde la raíz del repo, sirve la carpeta web:
python3 -m http.server 8080 --directory web
```

Abre [http://localhost:8080](http://localhost:8080), pega la URL del video y pulsa **Reproducir**.

También puedes abrir `web/index.html` directamente en el navegador (algunos servidores de video exigen HTTPS o CORS).

## Limitaciones

- No elimina anuncios a nivel de red (no es un bloqueador DNS); **automatiza** lo que un usuario haría con el ratón.
- YouTube y otros cambian su interfaz con frecuencia; si algo deja de funcionar, puede hacer falta actualizar selectores en `extension/content.js`.
- Respeta los términos de uso de cada plataforma; este proyecto es para uso personal y educativo.

## Estructura

```
extension/     Manifest V3, content script, popup
web/           Reproductor HTML5 simple
```

## Licencia

MIT — úsalo y modifícalo libremente.
