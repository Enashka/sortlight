export function supportsDirectoryPicker(browserWindow) {
  return Boolean(browserWindow?.isSecureContext && browserWindow.showDirectoryPicker);
}

export async function pickDirectory(browserWindow, options) {
  const picker = browserWindow?.showDirectoryPicker;
  if (typeof picker !== "function") {
    throw new DOMException("Directory picker is unavailable", "NotSupportedError");
  }

  // File-system picker methods are Window methods. Preserve their receiver so
  // Chromium does not reject the call as an illegal invocation.
  return picker.call(browserWindow, options);
}
