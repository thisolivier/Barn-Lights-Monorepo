import * as gradient from './library/gradient.mjs';
import * as solid from './library/solid.mjs';
import * as fire from './library/fire.mjs';
import * as digitalRain from './library/digitalRain.mjs';
import * as diagonalStripes from './library/diagonalStripes.mjs';

export const effects = {
  [gradient.id]: gradient,
  [solid.id]: solid,
  [fire.id]: fire,
  [digitalRain.id]: digitalRain,
  [diagonalStripes.id]: diagonalStripes,
};
