/** Where each person's retirement age is entered; the ids are on the fields in the Personal step. */
export const RETIREMENT_AGE_TARGET = {
  self: "/my-data/personal#retirement-age",
  spouse: "/my-data/personal?person=spouse#spouse-retirement-age",
} as const;
