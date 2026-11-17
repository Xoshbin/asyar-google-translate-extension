/**
 * In-view action names and ids for the Translate view.
 *
 * Registered via `actions.registerAction({ id, ..., context: ActionContext.EXTENSION_VIEW, execute })`
 * so they populate the launcher's ⌘K action drawer while TranslateView is mounted.
 */
export const VIEW_ACTION_NAMES = [
  'copy-translation',
  'paste-translation',
  'toggle-full-text',
  'play-tts',
  'open-google-translate',
  'prev-lang-set',
  'next-lang-set',
  'swap',
  'open-history',
] as const;

export type ViewActionName = (typeof VIEW_ACTION_NAMES)[number];

/** The id used to register and unregister an in-view action. */
export function viewActionId(extensionId: string, name: ViewActionName): string {
  return `${extensionId}.view.${name}`;
}
