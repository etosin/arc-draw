import type { DrawIOFunction, DrawioFile } from "../../types.js";

type RenameableDrawioFile = DrawioFile & {
  rename?: (
    title: string,
    success: () => void,
    error: (error: unknown) => void,
  ) => void;
};

const DRAWIO_FILE_SUFFIX =
  /(\.drawio\.(?:svg|png)|\.drawio|\.xml|\.svg|\.png)$/i;

function normalize_optional_string(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value);
}

function title_with_preserved_suffix(
  currentTitle: string | null,
  requestedTitle: unknown,
) {
  const title = normalize_optional_string(requestedTitle)?.trim() ?? "";
  if (!title) {
    throw new Error("`title` must not be empty");
  }

  const currentSuffix = currentTitle?.match(DRAWIO_FILE_SUFFIX)?.[1] ?? "";
  if (!currentSuffix || DRAWIO_FILE_SUFFIX.test(title)) {
    return title;
  }

  return `${title}${currentSuffix}`;
}

function tool_error(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export const set_document_title: DrawIOFunction = (ui, options) => {
  const file = ui?.getCurrentFile?.() as RenameableDrawioFile | null;
  if (!file) {
    throw new Error("No active Draw.io file is available");
  }
  if (typeof file.rename !== "function") {
    throw new Error("Document renaming is not supported by this storage mode");
  }

  const previousTitle = normalize_optional_string(file.getTitle?.());
  const nextTitle = title_with_preserved_suffix(previousTitle, options.title);

  return new Promise<{ previous_title: string | null; title: string }>(
    (resolve, reject) => {
      file.rename?.(
        nextTitle,
        () => {
          resolve({
            previous_title: previousTitle,
            title: normalize_optional_string(file.getTitle?.()) ?? nextTitle,
          });
        },
        (error: unknown) => reject(tool_error(error)),
      );
    },
  );
};
