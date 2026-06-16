import uuid from 'react-native-uuid';

/** UUID v4 — único e estável, seguro para sincronizar entre dispositivos. */
export function generateId(): string {
  return uuid.v4() as string;
}
