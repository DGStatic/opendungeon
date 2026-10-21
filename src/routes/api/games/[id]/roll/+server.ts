import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { gamerooms } from "#lib/server/gamerooms.js";
import { ServerMessageType, type DiceRolled } from "#lib/messages.js";
import {
  RollType,
  MINIMUM_DICE_AMOUNT,
  MAXIMUM_DICE_AMOUNT,
  MINIMUM_DIE,
  MAXIMUM_DIE,
} from "#lib/game/index.js";

const ROLL_PREFIX = "/roll-";

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

  const [roll, dice] = parts;

  const isTakeHighLowRoll = roll.length > ROLL_PREFIX.length + 1; // /roll-hx, /roll-lx
  const isOtherNonNormalRoll = roll.length === ROLL_PREFIX.length + 1; // /roll-a, /roll-d
  const rollFlag = isTakeHighLowRoll ? roll.at(ROLL_PREFIX.length) : roll.at(-1);

  const rollType = isTakeHighLowRoll
    ? rollFlag === RollType.TakeHigh
      ? RollType.TakeHigh
      : rollFlag === RollType.TakeLow
        ? RollType.TakeLow
        : RollType.Normal
    : isOtherNonNormalRoll
      ? rollFlag === RollType.Advantage
        ? RollType.Advantage
        : rollFlag === RollType.Disadvantage
          ? RollType.Disadvantage
          : RollType.Normal
      : RollType.Normal;

  const takeHighLowAmount =
    rollType === RollType.TakeHigh || rollType === RollType.TakeLow
      ? Math.max(1, Number(roll.slice(ROLL_PREFIX.length + 1)))
      : 1;
  if (Number.isNaN(takeHighLowAmount)) {
    error(400, "Bad roll string");
  }

  const dieParts = dice.split("d");
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
  const allRolls = [];
  for (let i = 0; i < amount; i++) {
    const roll = Math.ceil(Math.random() * die);
    const roll2 = Math.ceil(Math.random() * die);
    switch (rollType) {
      case RollType.Advantage:
        rolls.push(Math.max(roll, roll2));
        allRolls.push(roll, roll2);
        break;
      case RollType.Disadvantage:
        rolls.push(Math.min(roll, roll2));
        allRolls.push(roll, roll2);
        break;
      default:
        rolls.push(roll);
        allRolls.push(roll);
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
    total: rolls.reduce((prev, curr) => prev + curr),
    rolls: allRolls,
  };
  await gamerooms.publish(gameId, message);

  return new Response(null, { status: 204 });
};
