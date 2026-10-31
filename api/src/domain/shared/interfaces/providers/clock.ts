/** Fuente de tiempo, inyectable para mantener la lógica determinista. */
export interface Clock {
  now(): Date;
}
