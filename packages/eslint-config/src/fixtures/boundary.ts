import { readFile } from 'node:fs/promises';

export const load = readFile;

export const width: number = window.innerWidth;
