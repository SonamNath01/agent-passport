import { randomUUID } from "node:crypto";
import { prisma } from "./db.js";

/**
 * reserve() is the only place cumulative spend is checked against the cap.
 * This is deliberately two separate, unwrapped statements rather than one
 * prisma.$transaction():
 *
 *   1. an idempotent INSERT ... ON CONFLICT DO NOTHING that creates the
 *      ledger row the first time this mandate ever spends.
 *   2. the atomic conditional UPDATE that resets the window if it has
 *      elapsed and only applies the reservation if spent + reserved +
 *      amount still fits under capPaise.
 *
 * They can't be combined into one WITH-CTE statement: Postgres runs every
 * CTE and the main query against the same snapshot taken at the start of
 * the statement, so step 2's UPDATE would never see the row step 1 had just
 * inserted moments earlier in that same statement — the mandate's very
 * first reservation would always read as "no such row" and wrongly fail
 * closed. They also can't share a prisma.$transaction(): under real
 * concurrent load (many other queries sharing the same pool) this driver
 * adapter does not reliably pin every statement in an interactive
 * transaction to one connection, which was observed corrupting the cap
 * check under parallel authorize calls. Splitting them into two ordinary,
 * separately-committed statements sidesteps both problems — step 2's own
 * UPDATE is still the single atomic statement that decides the cap, so two
 * concurrent reserve() calls for the same mandate still just serialize on
 * that row's lock. Returns the new reservation id, or null if the cap would
 * be breached.
 */
export async function reserve(
  mandateId: string,
  capPaise: number,
  windowHours: number,
  amountPaise: number,
): Promise<string | null> {
  await prisma.$executeRaw`
    INSERT INTO "spend_ledgers" ("id", "mandateId", "capPaise", "windowHours", "updatedAt")
    VALUES (${randomUUID()}, ${mandateId}, ${capPaise}, ${windowHours}, now())
    ON CONFLICT ("mandateId") DO NOTHING;
  `;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "spend_ledgers"
    SET
      "spentPaise" = CASE
        WHEN now() >= "windowStart" + ("windowHours"::text || ' hours')::interval THEN 0
        ELSE "spentPaise"
      END,
      "reservedPaise" = CASE
        WHEN now() >= "windowStart" + ("windowHours"::text || ' hours')::interval THEN ${amountPaise}
        ELSE "reservedPaise" + ${amountPaise}
      END,
      "windowStart" = CASE
        WHEN now() >= "windowStart" + ("windowHours"::text || ' hours')::interval THEN now()
        ELSE "windowStart"
      END
    WHERE "mandateId" = ${mandateId}
      AND (
        CASE
          WHEN now() >= "windowStart" + ("windowHours"::text || ' hours')::interval THEN ${amountPaise}
          ELSE "spentPaise" + "reservedPaise" + ${amountPaise}
        END
      ) <= "capPaise"
    RETURNING id;
  `;

  if (rows.length === 0) {
    return null;
  }

  const reservation = await prisma.reservation.create({
    data: { mandateId, amountPaise, status: "RESERVED" },
  });
  return reservation.id;
}

/** Moves a reservation's amount from reservedPaise into spentPaise. Called once the payment it guarded actually goes through. */
export async function commit(reservationId: string): Promise<void> {
  // Same single-CTE-statement shape as reserve(), for the same reason: the
  // "claim this reservation, then adjust the ledger" pair only needs to be
  // atomic with itself, not pinned across two round trips.
  await prisma.$executeRaw`
    WITH claimed AS (
      UPDATE "reservations"
      SET "status" = 'COMMITTED'
      WHERE "id" = ${reservationId} AND "status" = 'RESERVED'
      RETURNING "mandateId", "amountPaise"
    )
    UPDATE "spend_ledgers"
    SET
      "spentPaise" = "spentPaise" + (SELECT "amountPaise" FROM claimed),
      "reservedPaise" = "reservedPaise" - (SELECT "amountPaise" FROM claimed)
    WHERE "mandateId" = (SELECT "mandateId" FROM claimed);
  `;
}

/** Gives a reservation's amount back to the cap. Called when the authorize call that made it fails a later check. */
export async function release(reservationId: string): Promise<void> {
  await prisma.$executeRaw`
    WITH claimed AS (
      UPDATE "reservations"
      SET "status" = 'RELEASED'
      WHERE "id" = ${reservationId} AND "status" = 'RESERVED'
      RETURNING "mandateId", "amountPaise"
    )
    UPDATE "spend_ledgers"
    SET "reservedPaise" = "reservedPaise" - (SELECT "amountPaise" FROM claimed)
    WHERE "mandateId" = (SELECT "mandateId" FROM claimed);
  `;
}
