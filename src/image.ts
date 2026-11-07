const ACCEPT = /^image\/(jpeg|png|webp)$/;

export function fitImage(file: File): Promise<string> {
  if (!ACCEPT.test(file.type)) return Promise.reject(new Error("La imagen tiene que ser JPEG, PNG o WebP."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.onload = () => {
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo leer la imagen."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const mime = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
        let data = canvas.toDataURL(mime, 0.82);
        if (data.length > 180_000) data = canvas.toDataURL("image/jpeg", 0.72);
        if (data.length > 180_000) data = canvas.toDataURL("image/jpeg", 0.5);
        if (data.length > 180_000) {
          reject(new Error("La imagen es demasiado grande."));
          return;
        }
        resolve(data);
      };
      img.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}
