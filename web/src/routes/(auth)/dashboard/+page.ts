import { callAPI, type APIFriend, type APIGame, type APILevelMetaData } from "$lib/api";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, parent }) => {
  const [levelsRes, gamesRes, friendRes] = await Promise.all([
    callAPI(fetch, "GET", "/levels"),
    callAPI(fetch, "GET", "/games"),
    callAPI(fetch, "GET", "/friends"),
  ]);
  if (!levelsRes.ok) {
    error(500, "Failed to get levels.");
  }
  if (!gamesRes.ok) {
    error(500, "Failed to get games.");
  }
  if (!friendRes.ok) {
    error(500, "Failed to get games.");
  }

  const levels: APILevelMetaData[] = await levelsRes.data.json();
  const games: APIGame[] = await gamesRes.data.json();
  const friends: APIFriend[] = await friendRes.data.json();

  const { profile } = await parent();

  return { profile, levels, games, friends };
};
