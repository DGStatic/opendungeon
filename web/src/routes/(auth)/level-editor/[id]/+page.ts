import { callAPI, type APICellTexture, type APIDecoration, type APILevel } from "$lib/api";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const prerender = false;

export const load: PageLoad = async ({ fetch, params }) => {
  const [cellTextureRes, decorationRes, levelRes] = await Promise.all([
    callAPI(fetch, "GET", "/cell-textures"),
    callAPI(fetch, "GET", "/decorations"),
    callAPI(fetch, "GET", "/levels/" + params.id),
  ]);
  if (!cellTextureRes.ok) {
    error(500, cellTextureRes.error.message);
  }
  if (!decorationRes.ok) {
    error(500, decorationRes.error.message);
  }

  const cellTextures: APICellTexture[] = await cellTextureRes.data.json();
  if (cellTextures.length < 1) {
    error(500, "instance has no cell textures");
  }

  const decorations: APIDecoration[] = await decorationRes.data.json();
  if (decorations.length < 1) {
    error(500, "instance has no decorations");
  }

  const level: { id: string; name: null; data: null } | APILevel = !levelRes.ok
    ? { id: params.id, name: null, data: null }
    : await levelRes.data.json();

  return {
    cellTextures,
    decorations,
    level,
  };
};
