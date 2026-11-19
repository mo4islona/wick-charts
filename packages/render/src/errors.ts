/** A spec the renderer cannot draw. The message names the field, so a person or an agent can fix it. */
export class RenderSpecError extends Error {
  override name = 'RenderSpecError';
}
