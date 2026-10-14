/** What the viewer tapped: a person or a table (by its position in the sorted table list). */
export type Selection = { kind: 'person'; id: string } | { kind: 'table'; idx: number } | { kind: 'pet' };

/** Called with the tapped thing and where it stands, so the camera can glide there. */
export type PickFn = (sel: Selection, x: number, z: number) => void;
