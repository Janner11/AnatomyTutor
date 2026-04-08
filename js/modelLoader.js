import { GLTFLoader } from "three-stdlib";
import { uniqueNonEmpty } from "./utils";

export const SYSTEMS = [
  {
    id: "circulatory",
    label: "Sistema circulatorio",
    modelFolder: "circulatory-system",
    indexFile: "nameIndex.circulatory.json",
    fileHints: ["CirculatorySystem", "circulatorySystem"],
  },
  {
    id: "digestive",
    label: "Sistema digestivo",
    modelFolder: "digestive-system",
    indexFile: "nameIndex.digestive.json",
    fileHints: ["digestiveSystem", "DigestiveSystem"],
  },
  {
    id: "lymphatic",
    label: "Sistema linfatico",
    modelFolder: "lymphatic-system",
    indexFile: "nameIndex.lymphatic.json",
    fileHints: ["lymphaticSystem", "LymphaticSystem"],
  },
  {
    id: "male-reproductive",
    label: "Sistema reproductor masculino",
    modelFolder: "male-reproductive-system",
    indexFile: "nameIndex.male-reproductive.json",
    fileHints: ["maleReproductiveSystem", "MaleReproductiveSystem"],
  },
  {
    id: "muscular",
    label: "Sistema muscular",
    modelFolder: "muscle-system",
    indexFile: "nameIndex.muscular.json",
    fileHints: ["muscleSystem", "muscularSystem", "MuscleSystem"],
  },
  {
    id: "nervous",
    label: "Sistema nervioso",
    modelFolder: "nervous-system",
    indexFile: "nameIndex.nervous.json",
    fileHints: ["nervousSystem", "NervousSystem"],
  },
  {
    id: "respiratory",
    label: "Sistema respiratorio",
    modelFolder: "respiratory-system",
    indexFile: "nameIndex.respiratory.json",
    fileHints: ["respiratorySystem", "RespiratorySystem"],
  },
  {
    id: "skeletal",
    label: "Sistema esqueletico",
    modelFolder: "skeletal-system",
    indexFile: "nameIndex.skeletal.json",
    fileHints: ["skeletalSystem", "SkeletalSystem"],
  },
  {
    id: "urinary",
    label: "Sistema urinario",
    modelFolder: "urinary-system",
    indexFile: "nameIndex.urinary.json",
    fileHints: ["urinarySystem", "UrinarySystem"],
  },
];

const loader = new GLTFLoader();

function buildModelCandidates(system, modelBaseUrl) {
  const base = `${modelBaseUrl}${system.modelFolder}/source/`;
  const idCompact = system.id.replace(/-/g, "");
  const folderCompact = system.modelFolder.replace(/-/g, "");
  const genericHints = [
    idCompact,
    `${idCompact}System`,
    folderCompact,
    `${folderCompact}System`,
  ];
  const stems = uniqueNonEmpty([...(system.fileHints || []), ...genericHints]);
  const urls = [];

  stems.forEach((stem) => {
    urls.push(`${base}${stem}.glb`);
    urls.push(`${base}${stem}.gltf`);
  });

  return uniqueNonEmpty(urls);
}

function loadGLTF(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

export async function loadSystemModel(system, modelBaseUrl) {
  const candidates = buildModelCandidates(system, modelBaseUrl);
  let lastError = null;

  for (const url of candidates) {
    try {
      const gltf = await loadGLTF(url);
      return { gltf, loadedUrl: url, candidatesTried: candidates };
    } catch (error) {
      lastError = error;
    }
  }

  const err = new Error(
    `No se pudo cargar modelo para sistema '${system.id}'.`,
  );
  err.cause = lastError;
  err.candidates = candidates;
  throw err;
}

export function getSystemById(systemId) {
  return SYSTEMS.find((item) => item.id === systemId) || null;
}
