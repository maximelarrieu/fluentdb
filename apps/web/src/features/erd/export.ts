import { toPng, toSvg } from 'html-to-image';
import type { ErdSchema } from '@fluentdb/shared';
import { toDbml } from './dbml.js';

function download(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function downloadText(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  download(url, filename);
  URL.revokeObjectURL(url);
}

/** Current theme's canvas background, so exports match what's on screen. */
function bgColor(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg')
      .trim() || '#101215'
  );
}

export async function exportPng(el: HTMLElement, name: string): Promise<void> {
  const url = await toPng(el, { backgroundColor: bgColor(), pixelRatio: 2 });
  download(url, `${name}.png`);
}

export async function exportSvg(el: HTMLElement, name: string): Promise<void> {
  const url = await toSvg(el, { backgroundColor: bgColor() });
  download(url, `${name}.svg`);
}

export function exportDbml(schema: ErdSchema, name: string): void {
  downloadText(toDbml(schema), `${name}.dbml`, 'text/plain;charset=utf-8');
}
