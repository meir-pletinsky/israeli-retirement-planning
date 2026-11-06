import { createContext, useContext } from "react";

/**
 * Whether the latest change to the profile has reached this device's storage. Every change is
 * written as it is made, so this is "saving" only for a moment, and "error" if the browser refused
 * the write. Kept apart from the profile context so a status change re-renders only its readers.
 */
export type SaveStatus = "saved" | "saving" | "error";

export const SaveStatusContext = createContext<SaveStatus>("saved");

export function useSaveStatus(): SaveStatus {
  return useContext(SaveStatusContext);
}
