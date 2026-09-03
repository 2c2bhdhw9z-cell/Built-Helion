/** Helion scene file — config only, never live particle positions. */
export type HelionScene = {
  helion: 1;
  name: string;
  config: object;
};

export function sceneDocument(config: object, name = "Helion scene"): HelionScene {
  return { helion: 1, name, config };
}

export function sceneJson(config: object, name = "Helion scene"): string {
  return `${JSON.stringify(sceneDocument(config, name), null, 2)}\n`;
}
