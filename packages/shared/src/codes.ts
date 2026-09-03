export const ReasonCode = {
  AGENT_SIGNATURE_INVALID: "AGENT_SIGNATURE_INVALID",
  MANDATE_SIGNATURE_INVALID: "MANDATE_SIGNATURE_INVALID",
  MANDATE_EXPIRED: "MANDATE_EXPIRED",
  MANDATE_REVOKED: "MANDATE_REVOKED",
  MERCHANT_NOT_ALLOWED: "MERCHANT_NOT_ALLOWED",
  CATEGORY_MISMATCH: "CATEGORY_MISMATCH",
  QUANTITY_EXCEEDED: "QUANTITY_EXCEEDED",
  PRICE_LIMIT_EXCEEDED: "PRICE_LIMIT_EXCEEDED",
  DESTINATION_MISMATCH: "DESTINATION_MISMATCH",
  NONCE_REPLAYED: "NONCE_REPLAYED",
  SPEND_CAP_EXCEEDED: "SPEND_CAP_EXCEEDED",
  AUTHORISED: "AUTHORISED",
  // Not a business-rule failure — a check couldn't run at all (DB unreachable,
  // unexpected exception) and the pipeline fell through to this instead of
  // guessing which of the ten meanings the failure was. Still BLOCK either way.
  INFRA_ERROR: "INFRA_ERROR",
} as const;

export type ReasonCode = (typeof ReasonCode)[keyof typeof ReasonCode];
