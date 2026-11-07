type Scene = {
  shape: "mug" | "wine" | "coupe" | "highball" | "cup" | "plate" | "car";
  liquid: string;
  accent: string;
  drops?: boolean;
};

const scenes: Record<string, Scene> = {
  clara: { shape: "mug", liquid: "#f2c14e", accent: "#fff4cc" },
  ambar: { shape: "mug", liquid: "#c47a2b", accent: "#f0d2a4" },
  oleaje: { shape: "highball", liquid: "#e25b8a", accent: "#ffd1e1" },
  bahia: { shape: "highball", liquid: "#7dcea0", accent: "#e7f6ee" },
  negroni: { shape: "coupe", liquid: "#c0392b", accent: "#f6d0a8" },
  blanco: { shape: "wine", liquid: "#f3e39a", accent: "#f7f1c8" },
  tinto: { shape: "wine", liquid: "#7b2430", accent: "#e7c2c6" },
  jamaica: { shape: "highball", liquid: "#a3263e", accent: "#f3c1cb" },
  limonada: { shape: "highball", liquid: "#f2d34a", accent: "#f7eeb0" },
  cafe: { shape: "cup", liquid: "#6b3e26", accent: "#efe2d6" },
  tostada: { shape: "plate", liquid: "#e0b15a", accent: "#8c9a4a" },
  papas: { shape: "plate", liquid: "#e2a23a", accent: "#f4d7a2" },
  ceviche: { shape: "plate", liquid: "#f4f7f8", accent: "#e26a4a" },
  arroz: { shape: "plate", liquid: "#f0d78c", accent: "#d4654a" },
  pollo: { shape: "plate", liquid: "#e7b48a", accent: "#c4471a" },
  costilla: { shape: "plate", liquid: "#a84832", accent: "#e7c2a0" },
  hinojo: { shape: "plate", liquid: "#d5e6c8", accent: "#f2c94c" },
  flan: { shape: "plate", liquid: "#f3ddb0", accent: "#c47a2b" },
  enjuague: { shape: "car", liquid: "#d8e4e1", accent: "#7eb8d4", drops: true },
  completo: { shape: "car", liquid: "#143f3c", accent: "#d8e4e1", drops: true },
  premium: { shape: "car", liquid: "#1b1914", accent: "#e0b15a", drops: true },
  detalle: { shape: "car", liquid: "#245c6b", accent: "#f4efe6", drops: true },
  cera: { shape: "car", liquid: "#c9a15b", accent: "#fff6d8" },
  motor: { shape: "car", liquid: "#5c564c", accent: "#d9d3c7" },
  tapiz: { shape: "car", liquid: "#6e4b3a", accent: "#eadfd4" },
  ozono: { shape: "car", liquid: "#dfeceb", accent: "#9fd4c8", drops: true },
};

const ink = "#1b1914";

function Mug({ liquid, accent }: Scene) {
  return (
    <>
      <rect x="22" y="10" width="28" height="40" rx="3" fill="#fffdf8" stroke={ink} strokeWidth="2" />
      <rect x="24" y="24" width="24" height="24" fill={liquid} />
      <rect x="24" y="16" width="24" height="10" fill={accent} />
      <path d="M50 18 h6 a8 8 0 0 1 0 16 h-6" fill="none" stroke={ink} strokeWidth="2" />
    </>
  );
}

function Wine({ liquid }: Scene) {
  return (
    <>
      <path d="M28 8 h24 l-4 22 a12 12 0 0 1-16 0 z" fill="#fffdf8" stroke={ink} strokeWidth="2" />
      <path d="M32 26 h16 l-2 6 a8 8 0 0 1-12 0 z" fill={liquid} />
      <rect x="38" y="36" width="4" height="14" fill={ink} />
      <rect x="30" y="50" width="20" height="3" rx="1" fill={ink} />
    </>
  );
}

function Coupe({ liquid, accent }: Scene) {
  return (
    <>
      <path d="M16 18 h48 c-6 16-14 22-24 22 s-18-6-24-22 z" fill={liquid} stroke={ink} strokeWidth="2" />
      <circle cx="52" cy="16" r="5" fill={accent} stroke={ink} strokeWidth="1.5" />
      <rect x="38" y="40" width="4" height="12" fill={ink} />
      <rect x="30" y="52" width="20" height="3" rx="1" fill={ink} />
    </>
  );
}

function Highball({ liquid, accent }: Scene) {
  return (
    <>
      <rect x="26" y="6" width="26" height="48" rx="3" fill="#fffdf8" stroke={ink} strokeWidth="2" />
      <rect x="28" y="22" width="22" height="30" fill={liquid} />
      <circle cx="36" cy="18" r="3" fill={accent} />
      <circle cx="44" cy="14" r="2.5" fill={accent} />
    </>
  );
}

function Cup({ liquid }: Scene) {
  return (
    <>
      <path d="M18 20 h36 l-4 28 h-28 z" fill="#fffdf8" stroke={ink} strokeWidth="2" />
      <path d="M22 28 h28 l-2 16 h-24 z" fill={liquid} />
      <path d="M54 26 h6 a8 8 0 0 1 0 14 h-6" fill="none" stroke={ink} strokeWidth="2" />
    </>
  );
}

function Plate({ liquid, accent }: Scene) {
  return (
    <>
      <ellipse cx="40" cy="36" rx="28" ry="16" fill="#fffdf8" stroke={ink} strokeWidth="2" />
      <ellipse cx="40" cy="36" rx="18" ry="10" fill={liquid} />
      <circle cx="40" cy="34" r="5" fill={accent} />
    </>
  );
}

function Car({ liquid, accent, drops }: Scene) {
  return (
    <>
      <path d="M18 36 h44 a6 6 0 0 1 6 6 v6 h-56 v-6 a6 6 0 0 1 6-6 z" fill={liquid} />
      <path d="M26 36 l6-12 h16 l6 12" fill={accent} stroke={ink} strokeWidth="1.5" />
      <circle cx="28" cy="50" r="5" fill={ink} />
      <circle cx="54" cy="50" r="5" fill={ink} />
      <circle cx="28" cy="50" r="2" fill="#f4efe6" />
      <circle cx="54" cy="50" r="2" fill="#f4efe6" />
      {drops ? (
        <>
          <path d="M14 18 c2 4 2 6 0 8" fill="none" stroke="#3d7ea6" strokeWidth="2" strokeLinecap="round" />
          <path d="M22 12 c2 4 2 6 0 8" fill="none" stroke="#3d7ea6" strokeWidth="2" strokeLinecap="round" />
          <path d="M66 16 c2 4 2 6 0 8" fill="none" stroke="#3d7ea6" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : null}
    </>
  );
}

export function WaveMark() {
  return (
    <svg className="wave" viewBox="0 0 64 28" aria-hidden="true">
      <path
        d="M2 18c6 0 6-8 12-8s6 8 12 8 6-8 12-8 6 8 12 8 6-8 12-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const PHOTO = /^data:image\/(jpeg|png|webp);base64,/i;

export function ProductArt({ id, image }: { id: string; image?: string }) {
  if (image && PHOTO.test(image)) return <img className="art photo" src={image} alt="" />;
  const scene = scenes[id] ?? { shape: "plate" as const, liquid: "#e7e0d2", accent: "#c4471a" };
  return (
    <svg className="art" viewBox="0 0 80 64" aria-hidden="true">
      {scene.shape === "mug" ? <Mug {...scene} /> : null}
      {scene.shape === "wine" ? <Wine {...scene} /> : null}
      {scene.shape === "coupe" ? <Coupe {...scene} /> : null}
      {scene.shape === "highball" ? <Highball {...scene} /> : null}
      {scene.shape === "cup" ? <Cup {...scene} /> : null}
      {scene.shape === "plate" ? <Plate {...scene} /> : null}
      {scene.shape === "car" ? <Car {...scene} /> : null}
    </svg>
  );
}
