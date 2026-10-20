import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gamerooms } from "#lib/server/gamerooms.js";
import { ServerMessageType, type DiceRolled } from "#lib/messages.js";

const ROLL_PREFIX = "/roll";
const MAXIMUM_DIE = 1000000;
const MAXIMUM_DICE_AMOUNT = 1000;

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const { session } = locals;
  if (!session) {
    redirect(303, "/sign-in");
  }

  const { id: gameId } = params;
  const { rollString }: { rollString: string } = await request.json();

  const parts = rollString.split(" ");
  if (parts.length < 2) {
    error(400, "Bad roll string");
  }

  const rollType =
    parts[0].length === ROLL_PREFIX.length + 1
      ? parts[0].at(-1) === "a"
        ? "advantage"
        : parts[0].at(-1) === "d"
          ? "disadvantage"
          : "normal"
      : "normal";

  const dieParts = parts[1].split("d");
  if (dieParts.length !== 2) {
    error(400, "Bad roll string");
  }

  const amount = Number(dieParts[0]);
  const die = Number(dieParts[1]);
  if (Number.isNaN(die) || Number.isNaN(amount)) {
    error(400, "Bad roll string");
  }
  if (die > MAXIMUM_DIE) {
    error(400, "Too big of a die");
  }
  if (amount > MAXIMUM_DICE_AMOUNT) {
    error(400, "Too many dice to roll");
  }

  let total = 0;
  for (let i = 0; i < amount; i++) {
    const roll = Math.ceil(Math.random() * die);
    const roll2 = Math.ceil(Math.random() * die);
    switch (rollType) {
      case "normal":
        total += roll;
        break;
      case "advantage":
        total += Math.max(roll, roll2);
        break;
      case "disadvantage":
        total += Math.min(roll, roll2);
        break;
    }
  }

  const message: DiceRolled = {
    type: ServerMessageType.DiceRolled,
    userId: session.user_id,
    roll: total,
  };
  await gamerooms.publish(gameId, message);

  return new Response(null, { status: 204 });
};
