import type { DrawIOFunction } from "../../types.js";

function normalize_optional_string(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value);
}

export const save_document: DrawIOFunction = (ui) => {
  const saveAction = ui?.actions?.get?.("save");
  if (!saveAction || typeof saveAction.funct !== "function") {
    throw new Error("The Draw.io save action is not available");
  }
  if (
    typeof saveAction.isEnabled === "function" &&
    saveAction.isEnabled() !== true
  ) {
    throw new Error("The Draw.io save action is currently disabled");
  }

  saveAction.funct();
  const file = ui?.getCurrentFile?.();

  return {
    triggered: true,
    title: normalize_optional_string(file?.getTitle?.()),
    mode: normalize_optional_string(file?.getMode?.()),
  };
};
