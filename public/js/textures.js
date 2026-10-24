// Small pixel-art block textures painted on canvases at start-up, so we ship no image files.
import * as THREE from 'three';
import { mulberry32 } from './worldgen.js';

const S = 16;

function paint(seed, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      g.fillStyle = fn(x, y, r);
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const pick = (r, list) => list[Math.floor(r() * list.length)];

const GRASS = ['#7fd35c', '#76cb54', '#86d964', '#6fc24e', '#7fd35c'];
const DIRT = ['#9b6b45', '#8f6140', '#a5754d', '#86593a'];
const SAND = ['#f3dc94', '#efd486', '#f6e2a2', '#e9cd7f'];
const STONE = ['#a3abb5', '#98a0aa', '#b0b8c1', '#8d959f'];
const LEAF = ['#4fae4a', '#5cbf52', '#459f42', '#63c759'];
const PINE = ['#2f8a52', '#2a7d4a', '#36975b', '#277246'];

export function makeTextures() {
  return {
    grassTop: paint(1, (x, y, r) => pick(r, GRASS)),
    grassSide: paint(2, (x, y, r) => (y < 3 || (y === 3 && r() < 0.5) ? pick(r, GRASS) : pick(r, DIRT))),
    dirt: paint(3, (x, y, r) => pick(r, DIRT)),
    sand: paint(4, (x, y, r) => pick(r, SAND)),
    stone: paint(5, (x, y, r) => pick(r, STONE)),
    bark: paint(6, (x, y, r) => (x % 4 === 0 ? '#6e4527' : r() < 0.5 ? '#8a5a34' : '#7d5130')),
    logTop: paint(7, (x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      return d > 7 ? '#7d5130' : Math.floor(d) % 3 === 0 ? '#b9875a' : '#cf9e6c';
    }),
    leaves: paint(8, (x, y, r) => pick(r, LEAF)),
    pine: paint(9, (x, y, r) => pick(r, PINE)),
    planks: paint(10, (x, y, r) => (y % 4 === 3 ? '#9b6a3f' : (x + (y >> 2) * 5) % 8 === 0 ? '#a77548' : r() < 0.5 ? '#c99a63' : '#c1915b')),
  };
}
