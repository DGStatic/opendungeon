import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gamerooms } from "#lib/server/gamerooms.js";
import { ServerMessageType, type DiceRolled } from "#lib/messages.js";

const ROLL_PREFIX = "/roll-";
const MINIMUM_DIE = 2;
const MAXIMUM_DIE = 1000000;
const MINIMUM_DICE_AMOUNT = 1;
const MAXIMUM_DICE_AMOUNT = 1000;

enum RollType {
  TakeHigh = "h",
  TakeLow = "l",
  Advantage = "a",
  Disadvantage = "d",
  Normal = "n",
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const { session } = locals;
  if (!session) {
    redirect(303, "/sign-in");
  }

  const { id: gameId } = params;
  const { rollString }: { rollString: string } = await request.json();

  const parts = rollString.toLowerCase().split(" ");
  if (parts.length < 2) {
    error(400, "Bad roll string");
  }

  const rollType =
    parts[0].length > ROLL_PREFIX.length + 1
      ? parts[0].at(ROLL_PREFIX.length) === RollType.TakeHigh
        ? RollType.TakeHigh
        : parts[0].at(ROLL_PREFIX.length) === RollType.TakeLow
          ? RollType.TakeLow
          : RollType.Normal
      : parts[0].length === ROLL_PREFIX.length + 1
        ? parts[0].at(-1) === RollType.Advantage
          ? RollType.Advantage
          : parts[0].at(-1) === RollType.Disadvantage
            ? RollType.Disadvantage
            : RollType.Normal
        : RollType.Normal;

  const takeHighLowAmount =
    rollType === RollType.TakeHigh || rollType === RollType.TakeLow
      ? Number(parts[0].slice(ROLL_PREFIX.length + 1))
      : 0;
  if (Number.isNaN(takeHighLowAmount)) {
    error(400, "Bad roll string");
  }

  const dieParts = parts[1].split("d");
  if (dieParts.length > 2) {
    error(400, "Bad roll string");
  }

  const amount = dieParts.length > 1 ? Number(dieParts[0]) : 1;
  const die = dieParts.length > 1 ? Number(dieParts[1]) : Number(dieParts[0]);
  if (Number.isNaN(die) || Number.isNaN(amount)) {
    error(400, "Bad roll string");
  }
  if (die < MINIMUM_DIE || die > MAXIMUM_DIE) {
    error(400, "Invalid die");
  }
  if (amount < MINIMUM_DICE_AMOUNT || amount > MAXIMUM_DICE_AMOUNT) {
    error(400, "Too many dice to roll");
  }

  let rolls = [];
  for (let i = 0; i < amount; i++) {
    const roll = Math.ceil(Math.random() * die);
    const roll2 = Math.ceil(Math.random() * die);
    switch (rollType) {
      case RollType.Advantage:
        rolls.push(Math.max(roll, roll2));
        break;
      case RollType.Disadvantage:
        rolls.push(Math.min(roll, roll2));
        break;
      default:
        rolls.push(roll);
        break;
    }
  }

  if (rollType === RollType.TakeHigh) {
    rolls = rolls.sort((a, b) => b - a).slice(0, Math.min(takeHighLowAmount, amount));
  } else if (rollType === RollType.TakeLow) {
    rolls = rolls.sort().slice(0, Math.min(takeHighLowAmount, amount));
  }

  const message: DiceRolled = {
    type: ServerMessageType.DiceRolled,
    userId: session.user_id,
    roll: rolls.reduce((prev, curr) => prev + curr),
  };
  await gamerooms.publish(gameId, message);

  return new Response(null, { status: 204 });
};
