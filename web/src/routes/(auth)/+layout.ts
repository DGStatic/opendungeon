import { callAPI, NOT_FOUND, UNAUTHORIZED, type APIFriend, type APIProfile } from "$lib/api";
import { error, isRedirect, redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";

const profileRoute = "/me/edit";

export const load: LayoutLoad = async ({ url, fetch }) => {
  const [profileRes, friendsRes] = await Promise.all([
    callAPI(fetch, "GET", "/profiles/me").catch(
      (error) =>
        ({
          ok: false,
          error: isRedirect(error)
            ? new Error("Unauthorized", { cause: UNAUTHORIZED })
            : (error as Error),
        }) as const,
    ),
    callAPI(fetch, "GET", "/friends"),
  ]);

  if (!profileRes.ok) {
    if (profileRes.error.cause === UNAUTHORIZED) {
      redirect(303, "/sign-in");
    }

    const isEditingProfile = url.pathname.includes(profileRoute);
    if (profileRes.error.cause === NOT_FOUND) {
      if (isEditingProfile) {
        return { isSignedIn: true };
      }

      redirect(303, "/me/edit");
    }

    error(500, profileRes.error.message);
  }

  if (!friendsRes.ok) {
    error(500, friendsRes.error.message);
  }

  return {
    isSignedIn: true,
    profile: (await profileRes.data.json()) as APIProfile,
    friends: (await friendsRes.data.json()) as APIFriend[],
  };
};
